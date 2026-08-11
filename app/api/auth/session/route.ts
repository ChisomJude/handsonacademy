import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {admitLearner} from '@/lib/auth/admit';

/**
 * Runs the approval gate after a Google Identity Services sign-in. That flow creates
 * the session in the browser and never passes through /auth/callback, so the check
 * that lives there has to be invoked explicitly once the session cookie exists.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: 'auth_failed'}, {status: 401});
  const admission = await admitLearner(supabase, user);
  if (!admission.admitted) {
    await supabase.auth.signOut();
    return NextResponse.json({error: admission.reason}, {status: 403});
  }
  return NextResponse.json({ok: true});
}
