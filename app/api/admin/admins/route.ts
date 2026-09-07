import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {sendEmail} from '@/lib/email/send';
import {adminInviteEmail} from '@/lib/email/templates';

/**
 * Admin team management. The privileged work — writing the role onto auth.users —
 * happens inside the security definer functions from migration 005, which re-check
 * the caller themselves. This route is the ordinary admin gate plus input handling,
 * so a missing check here still cannot grant anybody anything.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function value(input: unknown, min: number, max: number) {
  return typeof input === 'string' && input.trim().length >= min && input.trim().length <= max ? input.trim() : null;
}

/** Postgres raises these as exceptions; turn them into the right HTTP status. */
function fromDatabase(message: string) {
  if (message.includes('admin access required')) return {status: 403, error: 'Admin access required'};
  if (message.includes('function public.invite_admin') || message.includes('claim_admin_invite') || message.includes('does not exist')) {
    return {status: 500, error: 'Migration 005 has not been applied to this database yet.'};
  }
  return {status: 400, error: message.replace(/^.*?:\s*/, '')};
}

async function admin() {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  return user?.app_metadata?.role === 'admin' ? {supabase, user} : null;
}

export async function POST(request: Request) {
  const session = await admin();
  if (!session) return NextResponse.json({error: 'Admin access required'}, {status: 403});
  let payload: {full_name?: unknown; email?: unknown};
  try { payload = await request.json() as {full_name?: unknown; email?: unknown}; }
  catch { return NextResponse.json({error: 'Invalid request.'}, {status: 400}); }

  const full_name = value(payload.full_name, 2, 160);
  const email = value(payload.email, 3, 254)?.toLowerCase() || null;
  if (!full_name || !email || !EMAIL.test(email)) {
    return NextResponse.json({error: 'Enter a name of at least 2 characters and a valid email address.'}, {status: 400});
  }

  const {data, error} = await session.supabase.rpc('invite_admin', {target_email: email, target_name: full_name});
  if (error) { const mapped = fromDatabase(error.message); return NextResponse.json({error: mapped.error}, {status: mapped.status}); }

  // The invite stands whether or not the email goes out, so a delivery failure is
  // reported rather than rolled back: the person can still sign in and be promoted.
  const invitedBy = session.user.user_metadata?.full_name as string | undefined;
  const delivery = await sendEmail(adminInviteEmail({full_name, email}, invitedBy || session.user.email || null));
  const promoted = Boolean((data as {promoted?: boolean} | null)?.promoted);
  return NextResponse.json({ok: true, email, full_name, promoted, emailed: delivery.sent, email_skipped: Boolean(delivery.skipped)});
}

export async function DELETE(request: Request) {
  const session = await admin();
  if (!session) return NextResponse.json({error: 'Admin access required'}, {status: 403});
  const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase();
  if (!email || !EMAIL.test(email)) return NextResponse.json({error: 'A valid email address is required.'}, {status: 400});
  const {error} = await session.supabase.rpc('revoke_admin', {target_email: email});
  if (error) { const mapped = fromDatabase(error.message); return NextResponse.json({error: mapped.error}, {status: mapped.status}); }
  return NextResponse.json({ok: true, email});
}
