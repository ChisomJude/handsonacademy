import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {missionContext} from '@/lib/submissions';

/**
 * Reviewing a submission. Every path here ends the same way: a message on the thread
 * and a notification the learner sees at next sign-in, so feedback never dies inside
 * the admin console. Marking a submission reviewed does not touch mission_progress:
 * review is feedback, not a gate on the next mission.
 */
type Reviewed = {id?: string; status?: 'approved' | 'needs_changes'; reviewer_notes?: string; message?: string};

async function adminSession() {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  return user?.app_metadata?.role === 'admin' ? {supabase, user} : null;
}

/** Adds one admin message to the thread and tells the learner it is there. */
async function notify(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  submission: {id: string; user_id: string; mission_id: string},
  author: {id: string; name: string},
  body: string,
  title: string,
) {
  const context = missionContext(submission.mission_id);
  await supabase.from('submission_messages').insert({
    submission_id: submission.id, author_id: author.id, author_role: 'admin', author_name: author.name, body,
  });
  await supabase.from('notifications').insert({
    user_id: submission.user_id,
    kind: 'submission',
    title,
    body: body.slice(0, 500),
    link: `/dashboard/missions/${submission.mission_id}`,
  });
  return context;
}

export async function PATCH(request: Request) {
  const session = await adminSession();
  if (!session) return NextResponse.json({error: 'Admin access required'}, {status: 403});

  let body: Reviewed;
  try { body = await request.json() as Reviewed; } catch { return NextResponse.json({error: 'Invalid request.'}, {status: 400}); }
  if (!body.id || !body.status) return NextResponse.json({error: 'id and status are required'}, {status: 400});

  const note = body.reviewer_notes?.trim() || null;
  const {data, error} = await session.supabase.from('submissions')
    .update({
      status: body.status,
      reviewer_notes: note,
      reviewed_at: new Date().toISOString(),
      reviewed_by_email: session.user.email || null,
    })
    .eq('id', body.id).select('id,user_id,mission_id,status').single();
  if (error) return NextResponse.json({error: error.message}, {status: 500});

  const reviewer = (session.user.user_metadata?.full_name as string) || session.user.email || 'Your reviewer';
  const context = missionContext(data.mission_id);
  const approved = body.status === 'approved';
  await notify(
    session.supabase, data, {id: session.user.id, name: reviewer},
    note || (approved
      ? 'Nice work. This one is approved, keep the momentum going.'
      : 'Have another look at this one when you get a chance.'),
    approved ? `Approved: ${context.missionTitle}` : `Feedback on ${context.missionTitle}`,
  );
  return NextResponse.json({submission: data});
}

/** A reply that is only a comment: cheer someone on without changing the verdict. */
export async function POST(request: Request) {
  const session = await adminSession();
  if (!session) return NextResponse.json({error: 'Admin access required'}, {status: 403});

  let body: {id?: string; message?: string};
  try { body = await request.json() as {id?: string; message?: string}; } catch { return NextResponse.json({error: 'Invalid request.'}, {status: 400}); }
  const message = body.message?.trim();
  if (!body.id || !message) return NextResponse.json({error: 'id and message are required'}, {status: 400});
  if (message.length > 5000) return NextResponse.json({error: 'Keep a message under 5,000 characters.'}, {status: 400});

  const {data, error} = await session.supabase.from('submissions')
    .select('id,user_id,mission_id').eq('id', body.id).single();
  if (error || !data) return NextResponse.json({error: 'Submission not found.'}, {status: 404});

  const reviewer = (session.user.user_metadata?.full_name as string) || session.user.email || 'Your reviewer';
  const context = await notify(
    session.supabase, data, {id: session.user.id, name: reviewer}, message,
    `${reviewer.split(' ')[0]} replied about ${missionContext(data.mission_id).missionTitle}`,
  );
  return NextResponse.json({ok: true, mission: context.missionTitle});
}
