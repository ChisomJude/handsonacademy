'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {LoaderCircle, Send} from 'lucide-react';

/** Turns a bulk send result into one sentence an admin can act on. */
export function describeBulkOutcome(body: {recipients: number; sent: number; queued: number; failed: number; skipped: boolean}, noun: string, nextWindow: string): string {
  if (body.skipped) return 'Email is not configured, so delivery was skipped.';
  const notes = [`Sent to ${body.sent} of ${body.recipients} ${noun} now.`];
  if (body.queued) notes.push(`${body.queued} queued: today's sending limit is used up, they go out automatically ${nextWindow}${body.queued > 90 ? ', up to 90 a day' : ''}.`);
  if (body.failed) notes.push(`${body.failed} failed.`);
  return notes.join(' ');
}

export function AnnouncementComposer({recipientCount, bulkLeft, nextWindow}: {recipientCount: number; bulkLeft: number; nextWindow: string}) {
  const router = useRouter(); const [sending, setSending] = useState(false); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const now = Math.min(recipientCount, bulkLeft), later = recipientCount - now;
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!confirm(later ? `Send this announcement to ${recipientCount} opted-in contact(s)? ${now} go out now and ${later} are queued for the next day(s).` : `Send this announcement to ${recipientCount} opted-in contact(s)?`)) return; setSending(true); setNotice(''); setError(''); const form = event.currentTarget, values = Object.fromEntries(new FormData(form).entries()); try { const response = await fetch('/api/admin/announcements', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(values)}); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Could not send the announcement.'); setNotice(describeBulkOutcome(body, 'contacts', nextWindow)); if (!body.failed && !body.skipped) form.reset(); router.refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send the announcement.'); } finally { setSending(false); } }
  return <form className="card" style={{padding: 26, maxWidth: 760, marginTop: 28}} onSubmit={submit}><span className="tag">Email announcement</span><h2 style={{fontSize: 29, margin: '14px 0 8px'}}>Send an update</h2><p className="lede" style={{fontSize: 14}}>This sends through Resend to {recipientCount} unique contact(s) who consented to emails through an application or event registration.{later > 0 && <> <strong>{now} will go out now</strong> and {later} will be queued for the next day(s), because bulk mail stops at 90 a day.</>}</p><div className="form-field"><label htmlFor="announcement-title">Subject</label><input id="announcement-title" name="title" minLength={2} maxLength={160} required placeholder="What should people know?"/></div><div className="form-field"><label htmlFor="announcement-body">Message</label><textarea id="announcement-body" name="body" minLength={2} maxLength={10000} rows={9} required placeholder="Write your update here. Paragraphs are preserved in the email."/></div>{error && <p role="alert" style={{color:'#b9462b',fontSize:13}}>{error}</p>}{notice && <p role="status" style={{color:'var(--brand)',fontSize:13}}>{notice}</p>}<button className="btn btn-primary" disabled={sending || !recipientCount}>{sending ? <><LoaderCircle size={16} className="spin"/> Sending…</> : <><Send size={16}/> Send to {recipientCount} contacts</>}</button><style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style></form>;
}
