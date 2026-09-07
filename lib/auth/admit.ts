import type {User} from '@supabase/supabase-js';
import type {createSupabaseServerClient} from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
export type Admission = {admitted: true; promoted: boolean} | {admitted: false; reason: 'approval_required' | 'lookup_failed'};

/**
 * Decides whether a freshly authenticated Google account may enter the portal, and
 * records their profile if so. Shared by both sign-in paths — the Google Identity
 * Services token flow and the legacy OAuth redirect — so the gate cannot drift
 * between them.
 */
export async function admitLearner(supabase: ServerClient, user: User): Promise<Admission> {
  let promoted = false;
  // An invited admin has usually never applied as a learner, so the invite is
  // claimed before the approval gate below can turn them away. claim_admin_invite
  // promotes the caller alone, and only against an invite an existing admin created
  // for the caller's own Google-verified address (migration 005). Before that
  // migration runs the RPC simply errors, leaving the old behaviour intact.
  if (user.app_metadata?.role !== 'admin') {
    const {data: claimed, error: claimError} = await supabase.rpc('claim_admin_invite');
    if (claimError) console.error('[auth] admin invite claim failed for', user.email, claimError);
    promoted = claimed === true;
  }
  if (!promoted && user.app_metadata?.role !== 'admin') {
    // Any approved application admits the learner, so take the most recent and
    // ignore the rest. maybeSingle() would null the result and raise PGRST116 on
    // more than one match, locking an approved learner out entirely.
    const {data: approved, error} = await supabase.from('community_inquiries')
      .select('id').eq('kind', 'learner').eq('email', (user.email || '').toLowerCase()).eq('status', 'approved')
      .order('created_at', {ascending: false}).limit(1);
    if (error) {
      console.error('[auth] approval lookup failed for', user.email, error);
      return {admitted: false, reason: 'lookup_failed'};
    }
    if (!approved?.length) return {admitted: false, reason: 'approval_required'};
  }
  await supabase.from('profiles').upsert({
    id: user.id,
    display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Learner',
    // Carried here so the review queue can name a learner without reading auth.users.
    email: user.email,
    avatar_url: user.user_metadata?.avatar_url || null,
    updated_at: new Date().toISOString(),
  }, {onConflict: 'id'});
  return {admitted: true, promoted};
}
