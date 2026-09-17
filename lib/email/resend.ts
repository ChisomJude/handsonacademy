// The Resend REST transport, and nothing else: no queue, no quota, no database.
// Two endpoints are used. `/emails` sends one message; `/emails/batch` takes up to
// 100 messages in one request, which is how a whole day's announcement goes out as
// a single call against the per-second request limit.
// Docs: https://resend.com/docs/api-reference/emails/send-batch-emails
import {createHash} from 'node:crypto';

const ENDPOINT = 'https://api.resend.com/emails';
/** Resend accepts at most this many emails in one batch request. */
export const BATCH_SIZE = 100;
/** Pause between consecutive requests: 50ms is 20 per second, under the 25 per second Resend granted this account. */
export const REQUEST_GAP_MS = 50;

export type ProviderMessage = {to: string; subject: string; html: string; text: string; replyTo?: string | null};
export type ProviderResult =
  | {ok: true; ids: string[]}
  | {ok: false; error: string; retryable: boolean; detail: string};

/** Sender configuration, or null when email is not set up in this environment. */
export function emailConfig(): {apiKey: string; from: string; replyTo?: string} | null {
  const apiKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return null;
  return {apiKey, from, replyTo: process.env.EMAIL_REPLY_TO || undefined};
}

/**
 * Stable key for a set of outbox rows. Resend remembers keys for 24 hours, so a
 * crashed run that is claimed again the same day cannot deliver twice.
 */
export function idempotencyKey(ids: string[]): string {
  return `outbox-${createHash('sha256').update([...ids].sort().join(',')).digest('hex').slice(0, 48)}`;
}

function payload(config: NonNullable<ReturnType<typeof emailConfig>>, message: ProviderMessage) {
  return {from: config.from, to: [message.to], subject: message.subject, html: message.html, text: message.text, reply_to: message.replyTo || config.replyTo || undefined};
}

/** 429 (rate limit or daily quota) and 5xx are worth trying again later; a 4xx otherwise is our payload. */
function classify(status: number): boolean { return status === 429 || status >= 500; }

async function post(url: string, config: NonNullable<ReturnType<typeof emailConfig>>, body: unknown, key: string): Promise<{status: number; json: unknown; text: string} | Error> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key},
      body: JSON.stringify(body),
    });
    const text = await response.text().catch(() => '');
    let json: unknown = null; try { json = JSON.parse(text); } catch {}
    return {status: response.status, json, text};
  } catch (cause) { return cause instanceof Error ? cause : new Error(String(cause)); }
}

/** Sends one email. Never throws. */
export async function postEmail(message: ProviderMessage, key: string): Promise<ProviderResult> {
  const config = emailConfig();
  if (!config) return {ok: false, error: 'email_not_configured', retryable: false, detail: ''};
  const result = await post(ENDPOINT, config, payload(config, message), key);
  if (result instanceof Error) return {ok: false, error: 'transport_failure', retryable: true, detail: result.message};
  if (result.status < 200 || result.status >= 300) return {ok: false, error: `provider_${result.status}`, retryable: classify(result.status), detail: result.text};
  const id = (result.json as {id?: string} | null)?.id;
  return {ok: true, ids: [id || '']};
}

/**
 * Sends up to BATCH_SIZE emails in one request. Resend validates the batch as a
 * whole, so the outcome is all-or-nothing: on success `ids` line up with the input
 * order, on failure no email in the batch went out.
 */
export async function postBatch(messages: ProviderMessage[], key: string): Promise<ProviderResult> {
  const config = emailConfig();
  if (!config) return {ok: false, error: 'email_not_configured', retryable: false, detail: ''};
  if (messages.length > BATCH_SIZE) return {ok: false, error: 'batch_too_large', retryable: false, detail: `${messages.length} > ${BATCH_SIZE}`};
  const result = await post(`${ENDPOINT}/batch`, config, messages.map(message => payload(config, message)), key);
  if (result instanceof Error) return {ok: false, error: 'transport_failure', retryable: true, detail: result.message};
  if (result.status < 200 || result.status >= 300) return {ok: false, error: `provider_${result.status}`, retryable: classify(result.status), detail: result.text};
  const data = (result.json as {data?: {id?: string}[]} | null)?.data || [];
  return {ok: true, ids: messages.map((_, index) => data[index]?.id || '')};
}
