import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {sendEmail} from '@/lib/email/send';
import {announcementEmail} from '@/lib/email/templates';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function value(input: unknown, min: number, max: number) { return typeof input === 'string' && input.trim().length >= min && input.trim().length <= max ? input.trim() : null; }

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return NextResponse.json({error: 'Admin access required'}, {status: 403});
  let payload: {title?: unknown; body?: unknown};
  try { payload = await request.json() as {title?: unknown; body?: unknown}; } catch { return NextResponse.json({error: 'Invalid request.'}, {status: 400}); }
  const title = value(payload.title, 2, 160), body = value(payload.body, 2, 10000);
  if (!title || !body) return NextResponse.json({error: 'Use a subject between 2-160 characters and a message between 2-10,000 characters.'}, {status: 400});

  // Only contacts that explicitly consented to communication are eligible. Each
  // address is normalised and deduplicated across applications and event sign-ups.
  const [{data: inquiries, error: inquiryError}, {data: registrations, error: registrationError}] = await Promise.all([
    supabase.from('community_inquiries').select('email').eq('consent', true),
    supabase.from('event_registrations').select('email,consent').eq('consent', true),
  ]);
  if (inquiryError || registrationError) return NextResponse.json({error: inquiryError?.message || registrationError?.message || 'Could not load recipients.'}, {status: 500});
  const recipients = [...new Set([...(inquiries || []), ...(registrations || [])].map(row => row.email.trim().toLowerCase()).filter(email => EMAIL.test(email)))];
  if (!recipients.length) return NextResponse.json({error: 'There are no opted-in email recipients yet.'}, {status: 400});
  const {data: announcement, error: insertError} = await supabase.from('announcements').insert({title, body, published: true, created_by: user.id}).select('id').single();
  if (insertError || !announcement) return NextResponse.json({error: insertError?.message || 'Could not save the announcement.'}, {status: 500});

  let sent = 0, failed = 0, skipped = 0;
  // Deliberately sequential: this protects the provider rate limit and ensures a
  // delivery failure for one address never prevents the rest from receiving it.
  for (const recipient of recipients) { const result = await sendEmail(announcementEmail(recipient, {title, body})); if (result.sent) sent++; else if (result.skipped) skipped++; else failed++; }
  await supabase.from('announcements').update({email_sent_at: sent ? new Date().toISOString() : null, email_recipient_count: sent, email_failure_count: failed}).eq('id', announcement.id);
  return NextResponse.json({recipients: recipients.length, sent, failed, skipped, announcement_id: announcement.id});
}
