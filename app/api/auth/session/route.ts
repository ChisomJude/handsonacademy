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
  // `promoted` tells the browser it just claimed an admin invite. The session it is
  // holding was minted before the role existed, so the client has to refresh it
  // before any admin page will recognise the account.
  return NextResponse.json({ok: true, promoted: admission.promoted});
}
