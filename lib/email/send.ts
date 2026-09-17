// Email delivery with Resend's free-tier limits built in.
//
// Resend allows 100 emails per UTC day and 25 requests per second. Every email
// goes through the outbox (migration 007) so the app always knows how much of
// today is used. Bulk mail -- announcements and event updates -- may use 90 of
// the 100; the last ten are held back for the emails a person is waiting on right
// now (event confirmations, application decisions, admin invites). Whatever does
// not fit is left `queued`, and /api/cron/email-outbox sends it after the quota
// resets at 00:00 UTC. Bulk sends use the batch endpoint, so a full day's quota is
// one request, well inside the per-second limit.
//
// Callers depend on `sendEmail` / `sendBulk` alone; the provider lives in resend.ts.
import {randomUUID} from 'node:crypto';
import {BATCH_SIZE, REQUEST_GAP_MS, emailConfig, idempotencyKey, postBatch, postEmail, type ProviderMessage} from './resend';
import {claim, enqueue, markFailed, markSent, outboxClient, type NewOutboxRow, type OutboxKind, type OutboxRow} from './outbox';

/** Resend free tier: emails per UTC calendar day. */
export const DAILY_LIMIT = 100;
/** Bulk mail stops here so transactional email still has room for the rest of the day. */
export const BULK_DAILY_CEILING = 90;
/** When the cron runs (see vercel.json), for the admin page. */
export const NEXT_WINDOW = 'after 00:15 UTC';

export type EmailMessage = {to: string; subject: string; html: string; text: string; replyTo?: string};
/** `queued` means it will go out in the next quota window rather than now. */
export type EmailResult = {sent: boolean; queued?: boolean; skipped?: boolean; error?: string};
export type BulkResult = {recipients: number; sent: number; queued: number; failed: number; skipped: boolean};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function toRow(message: EmailMessage, kind: OutboxKind, meta: {announcementId?: string; eventId?: string} = {}): NewOutboxRow {
  return {kind, priority: kind === 'transactional' ? 0 : 1, to_email: message.to, subject: message.subject, html: message.html, text_body: message.text, reply_to: message.replyTo || null, announcement_id: meta.announcementId || null, event_id: meta.eventId || null};
}
function toMessage(row: OutboxRow): ProviderMessage { return {to: row.to_email, subject: row.subject, html: row.html, text: row.text_body, replyTo: row.reply_to}; }

/**
 * Sends one transactional email. Never throws and never rejects: a failed send
 * must not fail the request that triggered it, because the database write already
 * succeeded. With no RESEND_API_KEY it logs and reports `skipped`, so local and
 * preview environments behave honestly instead of pretending mail went out. When
 * today's 100 are gone it reports `queued` and the cron delivers it tomorrow.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!emailConfig()) {
    console.warn(`[email] skipped "${message.subject}" to ${message.to}: RESEND_API_KEY or EMAIL_FROM is not set.`);
    return {sent: false, skipped: true, error: 'email_not_configured'};
  }
  const ids = outboxClient() ? await enqueue([toRow(message, 'transactional')]) : null;
  if (!ids) return direct(message);
  const claimed = await claim(DAILY_LIMIT, 1, ids);
  if (!claimed.length) {
    console.warn(`[email] daily quota reached; "${message.subject}" to ${message.to} queued for the next window.`);
    return {sent: false, queued: true, error: 'daily_quota'};
  }
  const result = await postEmail(message, idempotencyKey(ids));
  if (result.ok) { await markSent(ids, result.ids); return {sent: true}; }
  console.error(`[email] provider rejected "${message.subject}" to ${message.to}: ${result.error} ${result.detail}`);
  await markFailed(ids, `${result.error}: ${result.detail}`, result.retryable);
  return result.retryable ? {sent: false, queued: true, error: result.error} : {sent: false, error: result.error};
}

/** Untracked send, used only when the outbox is unavailable (no service key, or the insert failed). */
async function direct(message: EmailMessage): Promise<EmailResult> {
  const result = await postEmail(message, `direct-${randomUUID()}`);
  if (!result.ok) console.error(`[email] provider rejected "${message.subject}" to ${message.to}: ${result.error} ${result.detail}`);
  return result.ok ? {sent: true} : {sent: false, error: result.error};
}

/**
 * Queues one message per recipient and sends as many as today's bulk budget
 * allows, in batch requests of up to 100. The rest stay queued for the cron.
 * The numbers returned are what the admin sees, so `queued` counts rows that
 * will go out later and `failed` only the ones that will not.
 */
export async function sendBulk(messages: EmailMessage[], kind: Exclude<OutboxKind, 'transactional'>, meta: {announcementId?: string; eventId?: string} = {}): Promise<BulkResult> {
  const recipients = messages.length;
  if (!recipients) return {recipients, sent: 0, queued: 0, failed: 0, skipped: false};
  if (!emailConfig()) {
    console.warn(`[email] skipped bulk "${messages[0].subject}" to ${recipients} recipients: RESEND_API_KEY or EMAIL_FROM is not set.`);
    return {recipients, sent: 0, queued: 0, failed: 0, skipped: true};
  }
  const ids = outboxClient() ? await enqueue(messages.map(message => toRow(message, kind, meta))) : null;
  if (!ids) {
    // No outbox: the old behaviour, one request at a time, paced under the rate limit.
    let sent = 0, failed = 0;
    for (const message of messages) { if ((await direct(message)).sent) sent++; else failed++; await sleep(REQUEST_GAP_MS); }
    return {recipients, sent, queued: 0, failed, skipped: false};
  }
  const outcome = await deliverQueued(ids);
  return {recipients, sent: outcome.sent, queued: recipients - outcome.sent - outcome.failed, failed: outcome.failed, skipped: false};
}

/**
 * Drains the queue within today's bulk ceiling. With `onlyIds` it drains just
 * those rows (a fresh announcement); without, everything waiting, oldest and most
 * urgent first (the cron). Stops early on a rate-limit or quota response, leaving
 * the rows queued for the next run.
 */
export async function deliverQueued(onlyIds?: string[]): Promise<{sent: number; failed: number; halted?: string}> {
  let sent = 0, failed = 0;
  if (!emailConfig()) return {sent, failed, halted: 'email_not_configured'};
  for (let guard = 0; guard < 50; guard++) {
    const rows = await claim(BULK_DAILY_CEILING, BATCH_SIZE, onlyIds);
    if (!rows.length) break;
    const ids = rows.map(row => row.id);
    const result = await postBatch(rows.map(toMessage), idempotencyKey(ids));
    if (result.ok) {
      await markSent(ids, result.ids);
      sent += rows.length;
    } else if (result.retryable) {
      // Rate limited, quota exhausted, or the provider is down: back to the queue, try next window.
      console.error(`[email] batch of ${rows.length} deferred: ${result.error} ${result.detail}`);
      await markFailed(ids, `${result.error}: ${result.detail}`, true);
      return {sent, failed, halted: result.error};
    } else {
      // Resend validates a batch as a whole, so one bad address rejects all of them.
      // Send this claimed set one by one to isolate the bad row instead of losing the batch.
      console.error(`[email] batch of ${rows.length} rejected (${result.error}); retrying individually: ${result.detail}`);
      const single = await deliverIndividually(rows);
      sent += single.sent; failed += single.failed;
    }
    if (rows.length < BATCH_SIZE) break; // the claim was capped by today's budget, nothing more will be granted
    await sleep(REQUEST_GAP_MS);
  }
  return {sent, failed};
}

async function deliverIndividually(rows: OutboxRow[]): Promise<{sent: number; failed: number}> {
  let sent = 0, failed = 0;
  for (const row of rows) {
    const result = await postEmail(toMessage(row), idempotencyKey([row.id]));
    if (result.ok) { await markSent([row.id], result.ids); sent++; }
    else { await markFailed([row.id], `${result.error}: ${result.detail}`, result.retryable); if (!result.retryable) failed++; }
    await sleep(REQUEST_GAP_MS);
  }
  return {sent, failed};
}

/** Canonical public origin, without a trailing slash, for links inside emails. */
const CANONICAL_SITE = 'https://handsonacademy.org.ng';

/**
 * The address that goes into email. Preview and misconfigured deployments set
 * NEXT_PUBLIC_SITE_URL to a *.vercel.app host, and a link like that in a learner's
 * inbox is both off-brand and dead once the deployment rolls, so it is ignored in
 * favour of the canonical domain.
 */
export function siteUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  if (!configured) return CANONICAL_SITE;
  try {
    return /(^|\.)vercel\.app$/i.test(new URL(configured).hostname) ? CANONICAL_SITE : configured;
  } catch {
    return CANONICAL_SITE;
  }
}
