import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';

/**
 * A learner answering their reviewer. RLS decides whose thread this may land on, so
 * a forged submission id cannot post into somebody else's conversation.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  let body: {submission_id?: string; message?: string};
  try { body = await request.json() as {submission_id?: string; message?: string}; }
  catch { return NextResponse.json({error: 'Invalid request.'}, {status: 400}); }
  const message = body.message?.trim();
  if (!body.submission_id || !message) return NextResponse.json({error: 'submission_id and message are required'}, {status: 400});
  if (message.length > 5000) return NextResponse.json({error: 'Keep a message under 5,000 characters.'}, {status: 400});

  const {data, error} = await supabase.from('submission_messages').insert({
    submission_id: body.submission_id,
    author_id: user.id,
    author_role: 'learner',
    author_name: (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'Learner',
    body: message,
  }).select().single();
  if (error) return NextResponse.json({error: 'Could not post that reply.'}, {status: 400});
  return NextResponse.json({message: data}, {status: 201});
}
