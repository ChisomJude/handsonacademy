import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {sendEmail} from '@/lib/email/send';
import {applicationApprovedEmail, applicationDeclinedEmail} from '@/lib/email/templates';

type Status = 'approved'|'rejected'|'blocked'|'contacted'|'closed';
type EmailStatus = 'sent'|'already_sent'|'failed'|'not_configured'|null;
type Outcome = {id: string; ok: boolean; status?: Status; email_status?: EmailStatus; error?: string};

/**
 * Applies a decision to one inquiry and, for learner approvals and rejections,
 * emails the applicant. decision_email_sent_at is stamped only after a successful
 * send, so a repeat click never double-sends but a failed send can be retried.
 */
async function decide(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, id: string, status: Status, adminNotes?: string): Promise<Outcome> {
  const patch: Record<string, unknown> = {status, status_updated_at: new Date().toISOString()};
  if (adminNotes !== undefined) patch.admin_notes = adminNotes.trim() || null;
  const {data, error} = await supabase.from('community_inquiries').update(patch).eq('id', id).select().single();
  if (error) return {id, ok: false, error: error.message};

  let emailStatus: EmailStatus = null;
  const decidable = data.kind === 'learner' && (status === 'approved' || status === 'rejected');
  if (decidable && !data.decision_email_sent_at) {
    const result = await sendEmail(status === 'approved' ? applicationApprovedEmail(data) : applicationDeclinedEmail(data));
    emailStatus = result.sent ? 'sent' : result.skipped ? 'not_configured' : 'failed';
    if (result.sent) await supabase.from('community_inquiries').update({decision_email_sent_at: new Date().toISOString()}).eq('id', id);
  } else if (decidable) {
    emailStatus = 'already_sent';
  }
  return {id, ok: true, status, email_status: emailStatus};
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return NextResponse.json({error: 'Admin access required'}, {status: 403});
  const body = await request.json() as {id?: string; ids?: string[]; status?: Status; admin_notes?: string};
  const ids = body.ids?.length ? body.ids : body.id ? [body.id] : [];
  if (!ids.length || !body.status) return NextResponse.json({error: 'id (or ids) and status are required'}, {status: 400});
  if (ids.length > 100) return NextResponse.json({error: 'Apply a decision to at most 100 applications at a time.'}, {status: 400});

  // Sequential on purpose: each approval can send an email, and a burst of parallel
  // requests to the email provider is the fastest way to hit its rate limit.
  const results: Outcome[] = [];
  for (const id of ids) results.push(await decide(supabase, id, body.status, body.admin_notes));

  const failed = results.filter(result => !result.ok);
  return NextResponse.json({
    results,
    updated: results.length - failed.length,
    failed: failed.length,
    emailed: results.filter(result => result.email_status === 'sent').length,
    email_failures: results.filter(result => result.email_status === 'failed').length,
    email_unconfigured: results.some(result => result.email_status === 'not_configured'),
  });
}
