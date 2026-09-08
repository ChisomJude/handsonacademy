'use client';
import {useCallback, useEffect, useState} from 'react';
import {LoaderCircle, MessageSquare, Send, Star} from 'lucide-react';

type Submission = {id: string; mission_id: string; evidence: string; status: 'pending' | 'approved' | 'needs_changes'; reviewer_notes: string | null; reviewed_at: string | null; rating: number | null; rating_comment: string | null; created_at: string};
type Message = {id: string; submission_id: string; author_role: 'admin' | 'learner'; author_name: string | null; body: string; created_at: string};

const stamp = (value: string) => new Date(value).toLocaleString('en', {day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'});
const STATUS: Record<Submission['status'], [string, string, string]> = {
  approved: ['Approved', '#e2f4e8', '#12706d'],
  needs_changes: ['Reviewer asked for changes', '#fdeee5', '#b9462b'],
  pending: ['Waiting for review. Carry on to the next mission', '#eef4f6', '#4f6f72'],
};

/**
 * The learner's side of the same conversation the admin sees. Shows every attempt at
 * this mission, what the reviewer said, and a box to answer back.
 */
export function SubmissionThread({missionId, refreshKey}: {missionId: string; refreshKey?: unknown}) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/submissions?mission_id=${encodeURIComponent(missionId)}`);
      if (!response.ok) { setLoaded(true); return; }
      const body = await response.json() as {submissions?: Submission[]; messages?: Message[]};
      setSubmissions(body.submissions || []);
      setMessages(body.messages || []);
    } catch { /* signed out or not migrated: show nothing */ }
    setLoaded(true);
  }, [missionId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  async function answer(submissionId: string) {
    const message = (reply[submissionId] || '').trim();
    if (!message) return;
    setBusy(submissionId); setError('');
    try {
      const response = await fetch('/api/submissions/messages', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({submission_id: submissionId, message}),
      });
      if (!response.ok) throw new Error('Could not post that reply.');
      setReply(previous => ({...previous, [submissionId]: ''}));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not post that reply.');
    } finally { setBusy(null); }
  }

  if (!loaded || submissions.length === 0) return null;
  return <section style={{marginTop: 28}}>
    <span className="eyebrow">Your submissions</span>
    <p className="lede" style={{fontSize: 13, marginTop: 6}}>Every attempt at this mission, and what your reviewer said. Feedback never blocks you. The next mission is already open.</p>
    <div style={{display: 'grid', gap: 12, marginTop: 14}}>
      {submissions.map(submission => {
        const [label, background, color] = STATUS[submission.status];
        const thread = messages.filter(message => message.submission_id === submission.id);
        return <article className="card" style={{padding: 18}} key={submission.id}>
          <div style={{display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center'}}>
            <span style={{background, color, borderRadius: 99, padding: '5px 11px', font: "600 11px 'DM Mono',monospace"}}>{label}</span>
            <span style={{fontSize: 12, color: 'var(--muted)'}}>Submitted {stamp(submission.created_at)}</span>
          </div>
          <p style={{whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 14, marginTop: 12}}>{submission.evidence}</p>
          {submission.rating !== null && <p style={{fontSize: 12, color: 'var(--muted)', margin: 0}}>
            You rated this module {submission.rating}/5 <Star size={12} fill="var(--accent)" color="var(--accent)" style={{verticalAlign: 'middle'}} />
          </p>}

          {thread.length > 0 && <div style={{display: 'grid', gap: 8, marginTop: 14}}>
            {thread.map(message => <div key={message.id} style={{borderLeft: `3px solid ${message.author_role === 'admin' ? 'var(--brand)' : '#d9c3b4'}`, background: message.author_role === 'admin' ? '#f4faf8' : '#fdf9f6', padding: '10px 13px', borderRadius: '0 8px 8px 0'}}>
              <b style={{fontSize: 12}}>{message.author_role === 'admin' ? message.author_name || 'Your reviewer' : 'You'}</b>
              <span style={{fontSize: 11, color: 'var(--muted)', marginLeft: 8}}>{stamp(message.created_at)}</span>
              <p style={{margin: '4px 0 0', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap'}}>{message.body}</p>
            </div>)}
          </div>}

          <div style={{display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap'}}>
            <input value={reply[submission.id] || ''} onChange={event => setReply(previous => ({...previous, [submission.id]: event.target.value}))}
              placeholder="Reply to your reviewer…" style={{flex: '1 1 220px', font: 'inherit', fontSize: 13, padding: 10, border: '1px solid var(--line)', borderRadius: 8}} />
            <button className="btn btn-secondary" style={{fontSize: 13}} disabled={busy === submission.id || !(reply[submission.id] || '').trim()} onClick={() => answer(submission.id)}>
              {busy === submission.id ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />} Reply
            </button>
          </div>
        </article>;
      })}
    </div>
    {error && <p role="alert" style={{color: '#b9462b', fontSize: 13}}><MessageSquare size={13} /> {error}</p>}
  </section>;
}
