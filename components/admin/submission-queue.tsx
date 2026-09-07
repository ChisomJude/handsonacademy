'use client';
import {useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Check, History, LoaderCircle, Mail, MessageSquare, Send, Star} from 'lucide-react';
import type {SubmissionMessage} from '@/lib/submissions';

export type QueueRow = {
  id: string; user_id: string; mission_id: string; evidence: string;
  status: 'pending' | 'approved' | 'needs_changes';
  reviewer_notes: string | null; reviewed_at: string | null; reviewed_by_email: string | null;
  rating: number | null; rating_comment: string | null; created_at: string;
  learnerName: string; learnerEmail: string | null;
  context: {missionTitle: string; milestone: string | null; trackTitle: string; trackSlug: string | null; week: number | null; number: number | null; total: number};
  stage: {done: number; total: number; percent: number} | null;
  messages: SubmissionMessage[];
};

const FILTERS = [
  ['pending', 'Awaiting review'], ['needs_changes', 'Changes requested'], ['approved', 'Approved'], ['all', 'Everything'],
] as const;
const PER_PAGE = 10;
const stamp = (value: string) => new Date(value).toLocaleString('en', {day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'});

function Stars({rating}: {rating: number}) {
  return <span title={`${rating} of 5`} style={{display: 'inline-flex', gap: 2, verticalAlign: 'middle'}}>
    {[1, 2, 3, 4, 5].map(step => <Star key={step} size={13} fill={step <= rating ? 'var(--accent)' : 'none'} color={step <= rating ? 'var(--accent)' : '#c7d6d4'} />)}
  </span>;
}

function StatusTag({status}: {status: QueueRow['status']}) {
  const [label, background, color] = status === 'approved'
    ? ['Approved', '#e2f4e8', '#12706d']
    : status === 'needs_changes' ? ['Changes requested', '#fdeee5', '#b9462b'] : ['Awaiting review', '#eef4f6', '#4f6f72'];
  return <span style={{background, color, borderRadius: 99, padding: '5px 11px', font: "600 11px 'DM Mono',monospace", whiteSpace: 'nowrap'}}>{label}</span>;
}

export function SubmissionQueue({rows, limited}: {rows: QueueRow[]; limited: boolean}) {
  const router = useRouter();
  const [filter, setFilter] = useState<typeof FILTERS[number][0]>('pending');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(row =>
      (filter === 'all' || row.status === filter) &&
      (!needle || [row.learnerName, row.learnerEmail || '', row.context.missionTitle, row.context.trackTitle].some(value => value.toLowerCase().includes(needle))));
  }, [rows, filter, query]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const shown = visible.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const counts = useMemo(() => ({
    pending: rows.filter(row => row.status === 'pending').length,
    needs_changes: rows.filter(row => row.status === 'needs_changes').length,
    approved: rows.filter(row => row.status === 'approved').length,
    all: rows.length,
  }), [rows]);

  async function send(row: QueueRow, action: 'approved' | 'needs_changes' | 'comment') {
    const note = (notes[row.id] || '').trim();
    if (action === 'comment' && !note) { setError('Write a message before sending it.'); return; }
    setBusy(row.id); setError('');
    try {
      const response = action === 'comment'
        ? await fetch('/api/admin/submissions', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: row.id, message: note})})
        : await fetch('/api/admin/submissions', {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: row.id, status: action, reviewer_notes: note})});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not save that.');
      setNotes(previous => ({...previous, [row.id]: ''}));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that.');
    } finally { setBusy(null); }
  }

  function card(row: QueueRow, compact = false) {
    const learnerHistory = rows.filter(other => other.user_id === row.user_id && other.id !== row.id);
    return <article className="card" style={{padding: compact ? 16 : 22, background: compact ? '#fbfdfc' : '#fff'}} key={row.id}>
      <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start'}}>
        <div style={{minWidth: 0}}>
          <b style={{fontSize: 15}}>{row.learnerName}</b>
          {row.learnerEmail && <a href={`mailto:${row.learnerEmail}`} style={{display: 'inline-flex', gap: 5, alignItems: 'center', color: 'var(--brand)', fontSize: 13, marginLeft: 10}}><Mail size={13} />{row.learnerEmail}</a>}
          <p style={{margin: '7px 0 0', fontSize: 13, color: 'var(--muted)'}}>
            <b style={{color: 'var(--ink)'}}>{row.context.trackTitle}</b>
            {row.context.number ? ` · Mission ${row.context.number} of ${row.context.total}` : ''}
            {row.context.week ? ` · Week ${row.context.week}` : ''}
          </p>
          <p style={{margin: '3px 0 0', fontSize: 14, fontWeight: 700}}>{row.context.missionTitle}</p>
          {row.context.milestone && <p style={{margin: '2px 0 0', fontSize: 12, color: 'var(--muted)'}}>{row.context.milestone}</p>}
        </div>
        <div style={{textAlign: 'right', display: 'grid', gap: 6, justifyItems: 'end'}}>
          <StatusTag status={row.status} />
          {row.stage && <span style={{fontSize: 12, color: 'var(--muted)'}}>{row.stage.done}/{row.stage.total} missions done · {row.stage.percent}%</span>}
          <span style={{fontSize: 12, color: 'var(--muted)'}}>{stamp(row.created_at)}</span>
        </div>
      </div>

      {row.stage && <div className="stage-bar"><span style={{width: `${row.stage.percent}%`}} /></div>}

      <p style={{lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 14, fontSize: 14}}>{row.evidence}</p>

      {row.rating !== null && <div style={{background: '#f7fbf9', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 14px', marginTop: 12}}>
        <span style={{fontSize: 12, fontWeight: 700}}>Learner rated this module <Stars rating={row.rating} /></span>
        {row.rating_comment && <p style={{margin: '6px 0 0', fontSize: 13, color: 'var(--muted)', whiteSpace: 'pre-wrap', lineHeight: 1.6}}>“{row.rating_comment}”</p>}
      </div>}

      {row.messages.length > 0 && <div style={{marginTop: 14, display: 'grid', gap: 8}}>
        {row.messages.map(message => <div key={message.id} className={message.author_role === 'admin' ? 'thread-admin' : 'thread-learner'}>
          <b style={{fontSize: 12}}>{message.author_role === 'admin' ? message.author_name || 'Reviewer' : row.learnerName}</b>
          <span style={{fontSize: 11, color: 'var(--muted)', marginLeft: 8}}>{stamp(message.created_at)}</span>
          <p style={{margin: '4px 0 0', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap'}}>{message.body}</p>
        </div>)}
      </div>}

      {!compact && <div style={{marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14}}>
        <textarea
          value={notes[row.id] || ''}
          onChange={event => setNotes(previous => ({...previous, [row.id]: event.target.value}))}
          rows={2} placeholder={limited ? 'Reviewer note' : 'Write feedback, a question, or just cheer them on…'}
          style={{width: '100%', font: 'inherit', fontSize: 13, padding: 11, border: '1px solid var(--line)', borderRadius: 8}} />
        <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10}}>
          <button className="btn btn-primary" style={{fontSize: 13}} disabled={busy === row.id} onClick={() => send(row, 'approved')}>
            {busy === row.id ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Approve
          </button>
          <button className="btn btn-secondary" style={{fontSize: 13}} disabled={busy === row.id} onClick={() => send(row, 'needs_changes')}><MessageSquare size={15} /> Request changes</button>
          {!limited && <button className="btn btn-secondary" style={{fontSize: 13}} disabled={busy === row.id} onClick={() => send(row, 'comment')}><Send size={15} /> Send message only</button>}
          {learnerHistory.length > 0 && <button className="btn btn-secondary" style={{fontSize: 13}} onClick={() => setHistory(history === row.user_id ? null : row.user_id)}>
            <History size={15} /> {history === row.user_id ? 'Hide' : `${learnerHistory.length} earlier submission${learnerHistory.length > 1 ? 's' : ''}`}
          </button>}
        </div>
        {row.reviewed_at && <small style={{display: 'block', marginTop: 9, color: 'var(--muted)'}}>Reviewed {stamp(row.reviewed_at)}{row.reviewed_by_email ? ` by ${row.reviewed_by_email}` : ''}</small>}
        {history === row.user_id && <div style={{display: 'grid', gap: 10, marginTop: 14}}>
          <b style={{fontSize: 13}}>{row.learnerName}&rsquo;s trail</b>
          {learnerHistory.map(other => card(other, true))}
        </div>}
      </div>}
    </article>;
  }

  return <div>
    <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', margin: '26px 0 14px'}}>
      {FILTERS.map(([key, label]) => <button key={key} onClick={() => {setFilter(key); setPage(1);}} className={`chip ${filter === key ? 'chip-on' : ''}`}>{label} ({counts[key]})</button>)}
    </div>
    <input value={query} onChange={event => {setQuery(event.target.value); setPage(1);}} aria-label="Search submissions"
      placeholder="Search learner, email, mission or track…"
      style={{width: '100%', padding: 11, border: '1px solid #b9cbcd', borderRadius: 8, font: 'inherit'}} />
    {error && <p role="alert" style={{color: '#b9462b', fontSize: 13}}>{error}</p>}

    <div style={{display: 'grid', gap: 14, marginTop: 18}}>
      {shown.length === 0
        ? <div className="card" style={{padding: 24, color: 'var(--muted)'}}>Nothing here. Learners appear as soon as they submit mission evidence.</div>
        : shown.map(row => card(row))}
    </div>

    {visible.length > PER_PAGE && <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginTop: 18}}>
      <span style={{fontSize: 13, color: 'var(--muted)'}}>Showing {(current - 1) * PER_PAGE + 1}–{Math.min(current * PER_PAGE, visible.length)} of {visible.length}</span>
      <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
        <button className="btn btn-secondary" style={{fontSize: 12, padding: '9px 14px'}} onClick={() => setPage(current - 1)} disabled={current <= 1}>Previous</button>
        <span style={{fontSize: 13, fontWeight: 700}}>Page {current} of {pageCount}</span>
        <button className="btn btn-secondary" style={{fontSize: 12, padding: '9px 14px'}} onClick={() => setPage(current + 1)} disabled={current >= pageCount}>Next</button>
      </div>
    </div>}

    <style>{`.chip{border:1px solid var(--line);background:#fff;border-radius:99px;padding:8px 14px;font:600 12px Manrope;color:var(--muted);cursor:pointer}.chip-on{border-color:var(--brand);color:var(--brand);background:#eef8f4}.stage-bar{height:5px;border-radius:99px;background:#eaf2f0;margin-top:12px;overflow:hidden}.stage-bar span{display:block;height:100%;background:var(--brand)}.thread-admin{border-left:3px solid var(--brand);background:#f4faf8;padding:10px 13px;border-radius:0 8px 8px 0}.thread-learner{border-left:3px solid #d9c3b4;background:#fdf9f6;padding:10px 13px;border-radius:0 8px 8px 0}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>;
}
