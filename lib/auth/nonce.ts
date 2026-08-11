/**
 * Nonce pair for the Google Identity Services ID token flow.
 *
 * Google copies the nonce it is given verbatim into the ID token's `nonce` claim,
 * and Supabase hashes the nonce it is given before comparing it to that claim. So
 * Google must receive the hashed value and Supabase the raw one. Getting these the
 * wrong way round fails verification with an opaque error.
 */
export async function createNoncePair(): Promise<{raw: string; hashed: string}> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  return {raw, hashed};
}
