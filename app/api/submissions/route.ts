import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';

/**
 * The learner's own history for one mission, with the review thread attached. Used by
 * the mission page, which is statically generated and so cannot read this on the
 * server. RLS keeps the rows scoped to the signed-in account.
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  const missionId = new URL(request.url).searchParams.get('mission_id');

  let query = supabase.from('submissions')
    .select('id,mission_id,evidence,status,reviewer_notes,reviewed_at,rating,rating_comment,created_at')
    .eq('user_id', user.id).order('created_at', {ascending: false}).limit(20);
  if (missionId) query = query.eq('mission_id', missionId);
  const {data: submissions, error} = await query;
  if (error) return NextResponse.json({submissions: [], messages: [], unavailable: true});

  const {data: messages} = submissions?.length
    ? await supabase.from('submission_messages')
        .select('id,submission_id,author_role,author_name,body,created_at')
        .in('submission_id', submissions.map(row => row.id)).order('created_at')
    : {data: []};
  return NextResponse.json({submissions: submissions || [], messages: messages || []});
}

/**
 * Records mission evidence, plus the learner's own rating of the module. Submitting
 * never gates progression: mission_progress is written separately by the client the
 * moment evidence lands, so a submission waiting for review does not hold anyone up.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  let body: {mission_id?: string; evidence?: string; rating?: unknown; rating_comment?: unknown};
  try { body = await request.json(); } catch { return NextResponse.json({error: 'Invalid request.'}, {status: 400}); }
  if (!body.mission_id || !body.evidence?.trim()) {
    return NextResponse.json({error: 'mission_id and evidence are required'}, {status: 400});
  }

  const rating = typeof body.rating === 'number' && Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5 ? body.rating : null;
  const comment = typeof body.rating_comment === 'string' && body.rating_comment.trim() ? body.rating_comment.trim().slice(0, 2000) : null;

  const {data, error} = await supabase.from('submissions').insert({
    user_id: user.id,
    mission_id: body.mission_id,
    evidence: body.evidence.trim(),
    rating,
    rating_comment: comment,
  }).select().single();
  if (error) return NextResponse.json({error: error.message}, {status: 500});

  // Keep the profile row current so the review queue can name whoever submitted.
  await supabase.from('profiles').upsert({
    id: user.id,
    display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Learner',
    email: user.email,
    updated_at: new Date().toISOString(),
  }, {onConflict: 'id'});

  return NextResponse.json({submission: data}, {status: 201});
}
