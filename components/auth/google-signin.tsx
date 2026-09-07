'use client';
import {useEffect, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';
import {createNoncePair} from '@/lib/auth/nonce';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

type CredentialResponse = {credential: string};
type GoogleIdentity = {
  accounts: {
    id: {
      initialize(config: {client_id: string; callback: (response: CredentialResponse) => void; nonce?: string; use_fedcm_for_prompt?: boolean}): void;
      renderButton(parent: HTMLElement, options: {type?: string; theme?: string; size?: string; text?: string; shape?: string; logo_alignment?: string; width?: number}): void;
    };
  };
};
declare global {
  interface Window {google?: GoogleIdentity}
}

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) { existing.addEventListener('load', () => resolve()); existing.addEventListener('error', () => reject(new Error('gsi_load_failed'))); return; }
    const script = document.createElement('script');
    script.src = GSI_SRC; script.async = true; script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('gsi_load_failed'));
    document.head.appendChild(script);
  });
}

/**
 * Signs in with Google entirely on this origin: Google returns a signed ID token to
 * the page, which Supabase verifies. Because no redirect URI is involved, the consent
 * screen shows this domain rather than the Supabase project URL.
 */
export function GoogleSignIn({onError, onBusy}: {onError: (message: string) => void; onBusy: (busy: boolean) => void}) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Inlined at build time, so this is known during render and must not be routed
  // through effect state.
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    async function handleCredential(credential: string, nonce: string) {
      onBusy(true); onError('');
      try {
        const client = createSupabaseBrowserClient();
        const {error} = await client.auth.signInWithIdToken({provider: 'google', token: credential, nonce});
        if (error) { onError(error.message); onBusy(false); return; }
        // The session cookie now exists, so the approval gate can run server-side.
        const response = await fetch('/api/auth/session', {method: 'POST'});
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          onError(body.error === 'approval_required'
            ? 'Your application must be approved before you can access the learning portal.'
            : 'We could not complete sign-in. Please try again.');
          onBusy(false);
          return;
        }
        // Claiming an admin invite happens server-side during that call, so the
        // session in hand predates the role. Refresh it before routing, or /admin
        // would greet a brand-new admin with "access is restricted".
        const {promoted} = await response.json().catch(() => ({promoted: false})) as {promoted?: boolean};
        if (promoted) await client.auth.refreshSession();
        router.push(promoted ? '/admin' : '/dashboard');
        router.refresh();
      } catch {
        onError('We could not complete sign-in. Please try again.');
        onBusy(false);
      }
    }

    (async () => {
      try {
        await loadGoogleScript();
        const {raw, hashed} = await createNoncePair();
        if (cancelled || !buttonRef.current || !window.google) return;
        // Google embeds the hashed nonce in the token; Supabase hashes the raw one to
        // compare. See lib/auth/nonce.ts.
        window.google.accounts.id.initialize({client_id: clientId, nonce: hashed, use_fedcm_for_prompt: true, callback: response => { void handleCredential(response.credential, raw); }});
        window.google.accounts.id.renderButton(buttonRef.current, {type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'center', width: 320});
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => { cancelled = true; };
  }, [clientId, onBusy, onError, router]);

  if (!clientId || failed) return null;
  return <div style={{display: 'grid', placeItems: 'center', minHeight: 44}}>
    <div ref={buttonRef} style={{colorScheme: 'light'}} />
    {!ready && <small style={{color: 'var(--muted)'}}>Loading Google sign-in…</small>}
  </div>;
}
