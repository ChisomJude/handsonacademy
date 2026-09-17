import {NextResponse} from 'next/server';
import {deliverQueued} from '@/lib/email/send';

// Daily drain of the email outbox, scheduled in vercel.json shortly after Resend's
// quota resets at 00:00 UTC. Vercel calls it with `Authorization: Bearer $CRON_SECRET`;
// that header is the only credential, so the route refuses everything else and
// refuses outright when the secret is not configured.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({error: 'CRON_SECRET is not set'}, {status: 500});
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  const outcome = await deliverQueued();
  console.log(`[email] cron drained outbox: ${outcome.sent} sent, ${outcome.failed} failed${outcome.halted ? `, halted: ${outcome.halted}` : ''}`);
  return NextResponse.json({ok: true, ...outcome, at: new Date().toISOString()});
}
