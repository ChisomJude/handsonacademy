// Database side of the email outbox (migration 007). Every function here talks to
// Supabase with the service-role client because the outbox is written from requests
// with no session (a stranger registering for an event) and drained by a cron with
// no user at all. Nothing here decides *whether* to send; that is send.ts.
import {createSupabaseServiceClient} from '@/lib/supabase/service';

export type OutboxKind = 'transactional' | 'announcement' | 'event_update';
export type OutboxRow = {
  id: string; kind: OutboxKind; priority: number; to_email: string; subject: string; html: string; text_body: string;
  reply_to: string | null; announcement_id: string | null; event_id: string | null; status: 'queued' | 'sending' | 'sent' | 'failed';
  attempts: number; last_error: string | null; provider_id: string | null; sent_day: string | null; claimed_at: string | null; sent_at: string | null; created_at: string;
};
export type NewOutboxRow = Pick<OutboxRow, 'kind' | 'priority' | 'to_email' | 'subject' | 'html' | 'text_body'> & Partial<Pick<OutboxRow, 'reply_to' | 'announcement_id' | 'event_id'>>;
export type OutboxStatus = {sent_today: number; queued: number; failed: number};

let warned = false;
/** The service client, or null (with one log line per process) when it is not configured. */
export function outboxClient() {
  const client = createSupabaseServiceClient();
  if (!client && !warned) { warned = true; console.warn('[email] SUPABASE_SERVICE_ROLE_KEY is not set: sending directly with no daily-quota tracking or queueing.'); }
  return client;
}

/** Inserts rows as `queued` and returns their ids in input order, or null if the write failed. */
export async function enqueue(rows: NewOutboxRow[]): Promise<string[] | null> {
  const client = outboxClient();
  if (!client || !rows.length) return null;
  const ids: string[] = [];
  // Chunked so a 2,000-contact announcement never becomes one oversized request.
  for (let index = 0; index < rows.length; index += 200) {
    const {data, error} = await client.from('email_outbox').insert(rows.slice(index, index + 200)).select('id');
    if (error || !data) { console.error('[email] could not queue emails:', error?.message); return null; }
    ids.push(...data.map(row => row.id as string));
  }
  return ids;
}

/** Atomically claims up to `limit` queued rows within today's remaining `cap`. See email_outbox_claim in migration 007. */
export async function claim(cap: number, limit: number, onlyIds?: string[]): Promise<OutboxRow[]> {
  const client = outboxClient();
  if (!client) return [];
  const {data, error} = await client.rpc('email_outbox_claim', {daily_cap: cap, batch_limit: limit, only_ids: onlyIds ?? null});
  if (error) { console.error('[email] could not claim queued emails:', error.message); return []; }
  return (data || []) as OutboxRow[];
}

export async function markSent(ids: string[], providerIds: string[]): Promise<void> {
  const {error} = await outboxClient()!.rpc('email_outbox_mark_sent', {ids, provider_ids: providerIds});
  if (error) console.error('[email] sent but could not record it (rows will be released as stalled):', error.message);
}

export async function markFailed(ids: string[], reason: string, retryable: boolean): Promise<void> {
  const {error} = await outboxClient()!.rpc('email_outbox_mark_failed', {ids, reason, retryable});
  if (error) console.error('[email] could not record a failed send:', error.message);
}
