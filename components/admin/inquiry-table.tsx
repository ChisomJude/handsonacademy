'use client';
import {Fragment, useMemo, useState} from 'react';
import {Check, ChevronDown, ChevronRight, Copy, Download, LoaderCircle, ShieldOff, X, Mail, PhoneCall} from 'lucide-react';

export type Inquiry = {
  id: string; kind: string; full_name: string; email: string; phone: string;
  country: string | null; organization: string | null; focus: string | null; message: string;
  status: string; admin_notes: string | null; created_at: string; decision_email_sent_at: string | null;
};

type Status = 'approved'|'rejected'|'blocked'|'contacted'|'closed';

const KINDS = [
  {key: 'learner', label: 'Learners', blurb: 'Applications for portal access. Approving one emails the applicant a sign-in link.'},
  {key: 'mentor', label: 'Mentors & speakers', blurb: 'People offering to teach or speak. No automated email is sent.'},
  {key: 'sponsor', label: 'Sponsors', blurb: 'Organisations offering support. No automated email is sent.'},
] as const;

const STATUS_COLOURS: Record<string, string> = {
  new: '#12706d', approved: '#1c7c3f', rejected: '#b9462b', blocked: '#8a2c17', contacted: '#8a6d1f', closed: '#4f6f72',
};

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function download(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], {type: 'text/csv;charset=utf-8'}));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  URL.revokeObjectURL(url);
}

export function InquiryTable({initial}: {initial: Inquiry[]}) {
  const [rows, setRows] = useState(initial);
  const [kind, setKind] = useState<string>('learner');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    rows.forEach(row => { tally[row.kind] = (tally[row.kind] || 0) + 1; });
    return tally;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(row =>
      row.kind === kind
      && (status === 'all' || row.status === status)
      && (!needle || [row.full_name, row.email, row.phone, row.organization, row.country].some(field => field?.toLowerCase().includes(needle))));
  }, [rows, kind, status, query]);

  // Bulk actions apply to the current selection, but export falls back to everything
  // on screen so "filter, then export" works without selecting every row by hand.
  const targets = useMemo(() => visible.filter(row => selected.has(row.id)), [visible, selected]);
  const exportSet = targets.length ? targets : visible;

  function toggle(id: string) {
    setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleAll() {
    setSelected(previous => visible.every(row => previous.has(row.id)) ? new Set() : new Set(visible.map(row => row.id)));
  }

  async function apply(next: Status, ids: string[]) {
    if (!ids.length) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/inquiries', {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ids, status: next, admin_notes: note || undefined})});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || 'Could not apply that decision.'); setBusy(false); return; }
      const succeeded = new Set<string>((body.results as {id: string; ok: boolean}[]).filter(result => result.ok).map(result => result.id));
      setRows(previous => previous.map(row => succeeded.has(row.id) ? {...row, status: next, admin_notes: note || row.admin_notes} : row));
      setSelected(new Set());
      setNote('');
      const parts = [`${body.updated} updated`];
      if (body.emailed) parts.push(`${body.emailed} emailed`);
      if (body.email_unconfigured) parts.push('email not configured, so nobody was notified');
      if (body.email_failures) parts.push(`${body.email_failures} email(s) failed — repeat the action to retry`);
      if (body.failed) parts.push(`${body.failed} failed`);
      setNotice(parts.join(' · '));
    } catch {
      setError('Could not reach the server. Please try again.');
    }
    setBusy(false);
  }

  function exportCsv() {
    const header = ['Name', 'Email', 'Phone', 'Country', 'Interest', 'Experience', 'Status', 'Applied'];
    const lines = exportSet.map(row => [row.full_name, row.email, row.phone, row.country || '', row.organization || '', row.focus || '', row.status, new Date(row.created_at).toISOString().slice(0, 10)].map(csvCell).join(','));
    download(`handson-${kind}-${new Date().toISOString().slice(0, 10)}.csv`, [header.join(','), ...lines].join('\n'));
  }

  async function copyEmails() {
    const addresses = exportSet.map(row => row.email).join(', ');
    try { await navigator.clipboard.writeText(addresses); setNotice(`${exportSet.length} email address(es) copied.`); }
    catch { setError('Your browser blocked clipboard access.'); }
  }

  const allSelected = visible.length > 0 && visible.every(row => selected.has(row.id));
  const activeKind = KINDS.find(entry => entry.key === kind);

  return <div>
    <div role="tablist" style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 26}}>
      {KINDS.map(entry => <button key={entry.key} role="tab" aria-selected={kind === entry.key} onClick={() => { setKind(entry.key); setSelected(new Set()); setExpanded(null); }}
        className={`btn ${kind === entry.key ? 'btn-primary' : 'btn-secondary'}`} style={{fontSize: 13}}>
        {entry.label} <span style={{opacity: .75}}>({counts[entry.key] || 0})</span>
      </button>)}
    </div>
    {activeKind && <p className="lede" style={{fontSize: 13, marginTop: 12}}>{activeKind.blurb}</p>}

    <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '18px 0'}}>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, email, phone, country…" aria-label="Search inquiries"
        style={{flex: '1 1 240px', padding: 11, border: '1px solid #b9cbcd', borderRadius: 8, font: 'inherit'}} />
      <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter by status" style={{padding: 11, border: '1px solid #b9cbcd', borderRadius: 8, font: 'inherit'}}>
        {['all', 'new', 'approved', 'rejected', 'blocked', 'contacted', 'closed'].map(value => <option key={value} value={value}>{value === 'all' ? 'All statuses' : value}</option>)}
      </select>
      <button className="btn btn-secondary" style={{fontSize: 13}} onClick={exportCsv} disabled={!exportSet.length}><Download size={15} /> Export CSV ({exportSet.length})</button>
      <button className="btn btn-secondary" style={{fontSize: 13}} onClick={copyEmails} disabled={!exportSet.length}><Copy size={15} /> Copy emails</button>
    </div>

    {targets.length > 0 && <div className="card" style={{padding: 14, marginBottom: 14, display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center', background: '#f2faf6'}}>
      <b style={{fontSize: 13}}>{targets.length} selected</b>
      {kind === 'learner' && <>
        <button className="btn btn-primary" style={{fontSize: 13}} disabled={busy} onClick={() => apply('approved', targets.map(row => row.id))}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Approve &amp; email</button>
        <button className="btn btn-secondary" style={{fontSize: 13}} disabled={busy} onClick={() => apply('rejected', targets.map(row => row.id))}><X size={15} /> Reject &amp; email</button>
      </>}
      <button className="btn btn-secondary" style={{fontSize: 13}} disabled={busy} onClick={() => apply('contacted', targets.map(row => row.id))}><Mail size={15} /> Mark contacted</button>
      <button className="btn btn-secondary" style={{fontSize: 13}} disabled={busy} onClick={() => apply('closed', targets.map(row => row.id))}>Close</button>
      <button className="btn btn-secondary" style={{fontSize: 13}} disabled={busy} onClick={() => apply('blocked', targets.map(row => row.id))}><ShieldOff size={15} /> Block</button>
      <input value={note} onChange={event => setNote(event.target.value)} placeholder="Optional note applied to all selected" style={{flex: '1 1 200px', padding: 9, border: '1px solid var(--line)', borderRadius: 7, font: 'inherit', fontSize: 13}} />
    </div>}

    {notice && <p style={{color: 'var(--brand)', fontSize: 13}}>{notice}</p>}
    {error && <p role="alert" style={{color: '#b9462b', fontSize: 13}}>{error}</p>}

    <div className="card" style={{overflowX: 'auto'}}>
      <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720}}>
        <thead><tr style={{textAlign: 'left', borderBottom: '1px solid var(--line)'}}>
          <th style={{padding: '12px 10px', width: 38}}><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all visible" /></th>
          <th style={{padding: '12px 10px'}}>Name</th>
          <th style={{padding: '12px 10px'}}>Contact</th>
          <th style={{padding: '12px 10px'}}>Interest</th>
          <th style={{padding: '12px 10px'}}>Status</th>
          <th style={{padding: '12px 10px'}}>Applied</th>
          <th style={{padding: '12px 10px', width: 38}} />
        </tr></thead>
        <tbody>
          {visible.length === 0 && <tr><td colSpan={7} style={{padding: 26, textAlign: 'center', color: 'var(--muted)'}}>Nothing here yet.</td></tr>}
          {visible.map(row => <Fragment key={row.id}>
            <tr style={{borderBottom: '1px solid #eef4f2'}}>
              <td style={{padding: '11px 10px'}}><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.full_name}`} /></td>
              <td style={{padding: '11px 10px', fontWeight: 700}}>{row.full_name}<br /><span style={{fontWeight: 400, color: 'var(--muted)'}}>{row.country}</span></td>
              <td style={{padding: '11px 10px'}}><a href={`mailto:${row.email}`} style={{color: 'var(--brand)'}}>{row.email}</a><br /><a href={`tel:${row.phone}`} style={{color: 'var(--muted)'}}><PhoneCall size={11} /> {row.phone}</a></td>
              <td style={{padding: '11px 10px'}}>{row.organization || '—'}<br /><span style={{color: 'var(--muted)'}}>{row.focus || ''}</span></td>
              <td style={{padding: '11px 10px'}}><span className="tag" style={{color: STATUS_COLOURS[row.status] || 'var(--brand)', borderColor: 'currentColor'}}>{row.status}</span>{row.decision_email_sent_at && <><br /><small style={{color: 'var(--muted)'}}>emailed</small></>}</td>
              <td style={{padding: '11px 10px', color: 'var(--muted)', whiteSpace: 'nowrap'}}>{new Date(row.created_at).toLocaleDateString()}</td>
              <td style={{padding: '11px 10px'}}><button aria-label={`Show details for ${row.full_name}`} onClick={() => setExpanded(expanded === row.id ? null : row.id)} style={{border: 0, background: 'none', cursor: 'pointer', color: 'var(--muted)'}}>{expanded === row.id ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button></td>
            </tr>
            {expanded === row.id && <tr><td colSpan={7} style={{padding: '4px 14px 20px', background: '#fbfdfc'}}>
              <p style={{whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: '10px 0'}}>{row.message}</p>
              {row.admin_notes && <p style={{fontSize: 12, color: 'var(--muted)'}}><b>Note:</b> {row.admin_notes}</p>}
              <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10}}>
                {row.kind === 'learner' && <>
                  <button className="btn btn-primary" style={{fontSize: 13}} disabled={busy} onClick={() => apply('approved', [row.id])}><Check size={15} /> Approve &amp; email</button>
                  <button className="btn btn-secondary" style={{fontSize: 13}} disabled={busy} onClick={() => apply('rejected', [row.id])}><X size={15} /> Reject &amp; email</button>
                </>}
                <button className="btn btn-secondary" style={{fontSize: 13}} disabled={busy} onClick={() => apply('contacted', [row.id])}><Mail size={15} /> Mark contacted</button>
                <button className="btn btn-secondary" style={{fontSize: 13}} disabled={busy} onClick={() => apply('blocked', [row.id])}><ShieldOff size={15} /> Block</button>
              </div>
            </td></tr>}
          </Fragment>)}
        </tbody>
      </table>
    </div>
    <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>;
}
