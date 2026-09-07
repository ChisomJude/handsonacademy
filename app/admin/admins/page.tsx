import Link from 'next/link';
import {redirect} from 'next/navigation';
import {ArrowLeft} from 'lucide-react';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {AdminTeam, type AdminRow, type PendingInvite} from '@/components/admin/admin-team';

export const metadata = {title: 'Admin team'};

export default async function Admins() {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/admin');

  // list_admins reads auth.users, which PostgREST cannot expose, so it comes back
  // through the admin-only function added in migration 005.
  const [{data: admins, error: adminsError}, {data: invites}] = await Promise.all([
    supabase.rpc('list_admins'),
    supabase.from('admin_invites').select('id,email,full_name,invited_by_email,created_at')
      .is('accepted_at', null).is('revoked_at', null).order('created_at', {ascending: false}),
  ]);

  const notReady = adminsError && /does not exist|schema cache/i.test(adminsError.message);
  return <section className="shell section">
    <Link href="/admin" style={{fontSize: 13, color: 'var(--muted)', display: 'inline-flex', gap: 7, alignItems: 'center'}}><ArrowLeft size={15} /> Admin overview</Link>
    <span className="eyebrow" style={{display: 'block', marginTop: 30}}>Access</span>
    <h1>Admin team</h1>
    <p className="lede">Add someone by name and email. They become an admin by signing in with Google on that address — there is no password to share and nothing to run in the database.</p>
    {notReady
      ? <div className="card" style={{padding: 24, marginTop: 24}}><p role="alert" style={{color: '#b9462b', margin: 0, fontWeight: 700}}>Migration 005 has not reached this database yet.</p><p className="lede" style={{fontSize: 14, marginBottom: 0}}>Run the <b>Database migrations</b> workflow from the Actions tab, then reload this page.</p></div>
      : <AdminTeam
          admins={(admins || []) as AdminRow[]}
          pending={(invites || []) as PendingInvite[]}
          currentEmail={user.email || ''}
        />}
  </section>;
}
