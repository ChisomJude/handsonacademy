import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {admitLearner} from '@/lib/auth/admit';

/**
 * Legacy OAuth redirect flow. Retained so sign-in keeps working until the Supabase
 * redirect URI is removed from the Google client; the Google Identity Services flow
 * in components/auth/google-signin.tsx never reaches this route.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/login?error=auth_failed', url.origin));
  const supabase = await createSupabaseServerClient();
  const {data, error} = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(new URL('/login?error=auth_failed', url.origin));
  const admission = await admitLearner(supabase, data.user);
  if (!admission.admitted) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(`/login?error=${admission.reason === 'approval_required' ? 'approval_required' : 'auth_failed'}`, url.origin));
  }
  return NextResponse.redirect(new URL('/dashboard', url.origin));
}
