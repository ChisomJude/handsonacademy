'use client';
import {useState} from 'react';
import Link from 'next/link';
import {Chrome, LoaderCircle} from 'lucide-react';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';
import {GoogleSignIn} from './google-signin';

function initialMessage(): string {
  if (typeof window === 'undefined') return '';
  const reason = new URLSearchParams(window.location.search).get('error');
  if (reason === 'approval_required') return 'Your application must be approved before you can access the learning portal.';
  if (reason === 'auth_failed') return 'Authentication could not be completed. Please try again.';
  return '';
}

export function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialMessage);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const approvalRequired = error.startsWith('Your application must be approved');

  // Redirect flow, kept as a fallback while the Google client still lists the Supabase
  // callback URL. It sends users through the Supabase domain, so the consent screen
  // shows that address instead of ours.
  async function legacyLogin() {
    setLoading(true); setError('');
    if (!configured) { setError('Authentication is not configured yet.'); setLoading(false); return; }
    const {error: oauthError} = await createSupabaseBrowserClient().auth.signInWithOAuth({provider: 'google', options: {redirectTo: `${window.location.origin}/auth/callback`}});
    if (oauthError) { setError(oauthError.message); setLoading(false); }
  }

  return <div>
    <p style={{fontSize: 13, color: 'var(--muted)', lineHeight: 1.6}}>Access is available to approved HandsOn Academy applicants.</p>
    {configured
      ? <GoogleSignIn onError={setError} onBusy={setLoading} />
      : <p style={{fontSize: 13, color: 'var(--muted)'}}>Authentication is not configured yet.</p>}
    {loading && <p style={{display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginTop: 12}}><LoaderCircle className="spin" size={15} /> Signing you in…</p>}
    <button onClick={legacyLogin} disabled={loading} className="btn btn-secondary" style={{width: '100%', marginTop: 14, fontSize: 12, fontWeight: 600}}><Chrome size={15} /> Having trouble? Use the classic sign-in</button>
    {error && <div><p role="alert" style={{color: '#b9462b', fontSize: 13, lineHeight: 1.5}}>{error}</p>{approvalRequired && <Link href="/apply" className="btn btn-primary" style={{width: '100%', justifyContent: 'center'}}>Apply to HandsOn Academy</Link>}</div>}
    <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>;
}
