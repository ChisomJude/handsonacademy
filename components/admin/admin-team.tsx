'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Clock, Mail, ShieldCheck, UserPlus} from 'lucide-react';

export type AdminRow = {email: string; full_name: string; created_at: string; last_sign_in_at: string | null};
export type PendingInvite = {id: string; email: string; full_name: string; invited_by_email: string | null; created_at: string};

const when = (value: string | null) => value ? new Date(value).toLocaleDateString('en', {day: 'numeric', month: 'short', year: 'numeric'}) : null;

export function AdminTeam({admins, pending, currentEmail}: {admins: AdminRow[]; pending: PendingInvite[]; currentEmail: string}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch('/api/admin/admins', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(values)});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not add this admin.');
      setNotice(body.promoted
        ? `${body.email} is an admin now. They may need to sign out and back in for it to take effect.`
        : `${body.email} is invited. They become an admin the moment they sign in with Google on that address.`
        + (body.email_skipped ? ' No invite email was sent: email is not configured.' : body.email_queued ? " The invite email is queued: today's sending limit is used up, it goes out after 00:15 UTC." : ''));
      form.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this admin.');
    } finally { setBusy(false); }
  }

  async function remove(email: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/admins?email=${encodeURIComponent(email)}`, {method: 'DELETE'});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not remove this admin.');
      setNotice(`${email} no longer has admin access.`);
      setRemoving(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this admin.');
    } finally { setBusy(false); }
  }

  function row(key: string, name: string, email: string, meta: string, icon: React.ReactNode, self: boolean, removeLabel = 'Remove access') {
    return <div className="admin-row" key={key}>
      <div style={{display: 'flex', gap: 11, alignItems: 'center', minWidth: 0}}>
        {icon}
        <div style={{minWidth: 0}}>
          <b style={{display: 'block', fontSize: 14}}>{name}{self && <span className="tag" style={{marginLeft: 8, padding: '2px 7px'}}>You</span>}</b>
          <span style={{fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere'}}>{email}</span>
          <span style={{display: 'block', fontSize: 12, color: 'var(--muted)'}}>{meta}</span>
        </div>
      </div>
      {self
        ? <span style={{fontSize: 12, color: 'var(--muted)'}}>Cannot remove yourself</span>
        : removing === email
          ? <span style={{display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
              <span style={{fontSize: 12, fontWeight: 700, color: '#b9462b'}}>{removeLabel}?</span>
              <button className="btn btn-secondary" style={{fontSize: 11, padding: '8px 12px', color: '#b9462b', borderColor: '#e0b3a8'}} disabled={busy} onClick={() => remove(email)}>Yes, remove</button>
              <button className="btn btn-secondary" style={{fontSize: 11, padding: '8px 12px'}} onClick={() => setRemoving(null)}>Cancel</button>
            </span>
          : <button className="danger-link" onClick={() => setRemoving(email)}>{removeLabel}</button>}
    </div>;
  }

  return <div>
    <form className="card" style={{padding: 24, margin: '24px 0'}} onSubmit={invite}>
      <h2 style={{fontSize: 24, margin: 0}}>Add an admin</h2>
      <p className="lede" style={{fontSize: 13}}>They receive an email inviting them to sign in. Google verifies the address, so only the person holding that mailbox can take up the access.</p>
      <div className="admin-fields">
        <div className="form-field"><label htmlFor="invite-name">Full name</label><input id="invite-name" name="full_name" minLength={2} maxLength={160} required autoComplete="off" /></div>
        <div className="form-field"><label htmlFor="invite-email">Email address</label><input id="invite-email" name="email" type="email" maxLength={254} required autoComplete="off" placeholder="name@example.com" /></div>
      </div>
      {error && <p role="alert" style={{color: '#b9462b', fontSize: 13}}>{error}</p>}
      {notice && <p style={{color: 'var(--brand)', fontSize: 13}}>{notice}</p>}
      <button className="btn btn-primary" disabled={busy}><UserPlus size={15} /> {busy ? 'Working…' : 'Add admin'}</button>
    </form>

    <h2 style={{fontSize: 20, margin: '28px 0 0'}}>Current admins ({admins.length})</h2>
    <div className="card" style={{padding: 6, marginTop: 12}}>
      {admins.length === 0
        ? <p style={{padding: 22, textAlign: 'center', color: 'var(--muted)', margin: 0}}>No admins found.</p>
        : admins.map(person => row(person.email, person.full_name, person.email,
            person.last_sign_in_at ? `Last signed in ${when(person.last_sign_in_at)}` : 'Has not signed in yet',
            <ShieldCheck size={17} color="var(--brand)" style={{flexShrink: 0}} />,
            person.email.toLowerCase() === currentEmail.toLowerCase()))}
    </div>

    {pending.length > 0 && <>
      <h2 style={{fontSize: 20, margin: '28px 0 0'}}>Waiting for first sign-in ({pending.length})</h2>
      <p className="lede" style={{fontSize: 13}}>These people have no account yet. The role is applied automatically the first time they sign in with Google.</p>
      <div className="card" style={{padding: 6, marginTop: 12}}>
        {pending.map(invite => row(invite.id, invite.full_name, invite.email,
          `Invited ${when(invite.created_at)}${invite.invited_by_email ? ` by ${invite.invited_by_email}` : ''}`,
          <Clock size={17} color="var(--muted)" style={{flexShrink: 0}} />, false, 'Cancel invite'))}
      </div>
    </>}

    <p style={{display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--muted)', marginTop: 22, lineHeight: 1.6}}>
      <Mail size={15} style={{flexShrink: 0, marginTop: 2}} />
      An admin who is already signed in elsewhere keeps their old session for up to an hour. Signing out and back in applies a change immediately.
    </p>

    <style>{`.admin-fields{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.admin-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #eef4f2}.admin-row:last-child{border-bottom:0}.danger-link{display:inline-flex;align-items:center;gap:5px;background:none;border:0;padding:0;font:inherit;font-size:11px;font-weight:700;color:#9db0b0;cursor:pointer}.danger-link:hover{color:#b9462b;text-decoration:underline}@media(max-width:700px){.admin-fields{grid-template-columns:1fr}}`}</style>
  </div>;
}
