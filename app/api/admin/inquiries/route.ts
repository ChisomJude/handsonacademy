import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {sendEmail} from '@/lib/email/send';
import {applicationApprovedEmail, applicationDeclinedEmail} from '@/lib/email/templates';

type Status = 'approved'|'rejected'|'blocked'|'contacted'|'closed';

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return NextResponse.json({error: 'Admin access required'}, {status: 403});
  const body = await request.json() as {id?: string; status?: Status; admin_notes?: string};
  if (!body.id || !body.status) return NextResponse.json({error: 'id and status are required'}, {status: 400});

  const {data, error} = await supabase.from('community_inquiries')
    .update({status: body.status, admin_notes: body.admin_notes?.trim() || null, status_updated_at: new Date().toISOString()})
    .eq('id', body.id).select().single();
  if (error) return NextResponse.json({error: error.message}, {status: 500});

  // Tell the applicant. Approval is the decision that unlocks the portal, so the
  // email carries the sign-in link — without it an approved learner has no way to
  // know they can get in. decision_email_sent_at makes a second click a no-op, and
  // is only stamped once delivery actually succeeded, so a failed send can be
  // retried by clicking again.
  let emailStatus: 'sent' | 'already_sent' | 'failed' | 'not_configured' | null = null;
  const decidable = data.kind === 'learner' && (body.status === 'approved' || body.status === 'rejected');
  if (decidable && !data.decision_email_sent_at) {
    const message = body.status === 'approved' ? applicationApprovedEmail(data) : applicationDeclinedEmail(data);
    const result = await sendEmail(message);
    emailStatus = result.sent ? 'sent' : result.skipped ? 'not_configured' : 'failed';
    if (result.sent) {
      const stamped = new Date().toISOString();
      await supabase.from('community_inquiries').update({decision_email_sent_at: stamped}).eq('id', body.id);
      data.decision_email_sent_at = stamped;
    }
  } else if (decidable) {
    emailStatus = 'already_sent';
  }

  return NextResponse.json({inquiry: data, email_status: emailStatus});
}
