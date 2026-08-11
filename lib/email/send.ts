// Transactional email delivery. Provider is Resend, reached over its REST API so
// the project keeps its small dependency list. Swapping providers means rewriting
// only `deliver` below; callers depend on `sendEmail` alone.
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type EmailMessage = {to: string; subject: string; html: string; text: string; replyTo?: string};
export type EmailResult = {sent: boolean; skipped?: boolean; error?: string};

/**
 * Sends one email. Never throws and never rejects: a failed send must not fail
 * the request that triggered it, because the database write already succeeded.
 * With no RESEND_API_KEY configured it logs and reports `skipped`, so local and
 * preview environments behave honestly instead of pretending mail went out.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn(`[email] skipped "${message.subject}" to ${message.to}: RESEND_API_KEY or EMAIL_FROM is not set.`);
    return {sent: false, skipped: true, error: 'email_not_configured'};
  }
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo || process.env.EMAIL_REPLY_TO || undefined,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[email] provider rejected "${message.subject}" to ${message.to} (${response.status}): ${detail}`);
      return {sent: false, error: `provider_${response.status}`};
    }
    return {sent: true};
  } catch (cause) {
    console.error(`[email] transport failure for "${message.subject}" to ${message.to}:`, cause);
    return {sent: false, error: 'transport_failure'};
  }
}

/** Canonical public origin, without a trailing slash, for links inside emails. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://handsonacademy.org.ng').replace(/\/+$/, '');
}
