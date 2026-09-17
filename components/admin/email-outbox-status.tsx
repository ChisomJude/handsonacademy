'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {LoaderCircle, Inbox} from 'lucide-react';

type Props = {sentToday: number; queued: number; failed: number; dailyLimit: number; bulkCeiling: number; nextWindow: string; unavailable?: boolean};

/**
 * Today's Resend usage and the queue. The numbers come from the outbox, which is
 * the same place the send path checks, so what an admin sees here is exactly what
 * the next Send will be allowed to do.
 */
export function EmailOutboxStatus({sentToday, queued, failed, dailyLimit, bulkCeiling, nextWindow, unavailable}: Props) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const bulkLeft = Math.max(0, bulkCeiling - sentToday);
  async function drain() {
    setBusy(true); setNotice(''); setError('');
    try {
      const response = await fetch('/api/admin/email-outbox', {method: 'POST'}); const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not deliver the queue.');
      setNotice(body.sent ? `Delivered ${body.sent} queued email(s).` : body.halted ? `Nothing sent: ${body.halted === 'email_not_configured' ? 'email is not configured.' : 'the provider asked us to wait. The queue will be retried automatically.'}` : "Nothing sent: today's bulk limit is used up or the queue is empty.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not deliver the queue.'); } finally { setBusy(false); }
  }
  if (unavailable) return <div className="card" style={{padding: 18, maxWidth: 760, marginTop: 28, fontSize: 13, color: 'var(--muted)'}}><strong style={{color: 'var(--ink)'}}>Sending limits are not being tracked.</strong> Set <code>SUPABASE_SERVICE_ROLE_KEY</code> and run migration 007 so announcements are batched within the daily quota and the remainder is queued for the next day.</div>;
  return <div className="card" style={{padding: 18, maxWidth: 760, marginTop: 28}}>
    <div style={{display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', justifyContent: 'space-between'}}>
      <div style={{display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 13}}>
        <span><strong style={{fontSize: 20, display: 'block'}}>{sentToday} / {dailyLimit}</strong>sent today (UTC)</span>
        <span><strong style={{fontSize: 20, display: 'block'}}>{bulkLeft}</strong>bulk slots left today</span>
        <span><strong style={{fontSize: 20, display: 'block'}}>{queued}</strong>waiting in the queue</span>
        {failed > 0 && <span style={{color: '#b9462b'}}><strong style={{fontSize: 20, display: 'block'}}>{failed}</strong>failed for good</span>}
      </div>
      <button type="button" className="btn" disabled={busy || !queued || !bulkLeft} onClick={drain} title={!queued ? 'The queue is empty' : !bulkLeft ? "Today's bulk limit is used up" : undefined}>{busy ? <><LoaderCircle size={15} className="spin"/> Delivering…</> : <><Inbox size={15}/> Deliver queued now</>}</button>
    </div>
    <p style={{fontSize: 12, color: 'var(--muted)', margin: '12px 0 0', lineHeight: 1.6}}>Resend allows {dailyLimit} emails per UTC day. Bulk mail stops at {bulkCeiling} so {dailyLimit - bulkCeiling} slots stay free for registration and application emails. Anything queued is sent automatically {nextWindow}, up to {bulkCeiling} per day.</p>
    {error && <p role="alert" style={{color: '#b9462b', fontSize: 13, margin: '10px 0 0'}}>{error}</p>}
    {notice && <p role="status" style={{color: 'var(--brand)', fontSize: 13, margin: '10px 0 0'}}>{notice}</p>}
    <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>;
}
