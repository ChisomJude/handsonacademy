import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {sendBulk} from '@/lib/email/send';
import {announcementEmail} from '@/lib/email/templates';

// A day's worth of bulk mail is one batch request, but the fallback path (a
// rejected batch retried one address at a time) needs longer than the default.
export const maxDuration = 60;

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

  // Every recipient is queued, then as many as today's bulk budget allows go out
  // now in one batch request. The rest are delivered by the daily cron once the
  // provider quota resets, so nobody is dropped and no send exceeds the limit.
  const outcome = await sendBulk(recipients.map(recipient => announcementEmail(recipient, {title, body})), 'announcement', {announcementId: announcement.id});
  // The outbox keeps these counters current as the cron sends the rest (migration 007).
  await supabase.from('announcements').update({email_sent_at: outcome.sent ? new Date().toISOString() : null, email_recipient_count: outcome.sent, email_failure_count: outcome.failed, email_queued_count: outcome.queued}).eq('id', announcement.id);
  return NextResponse.json({...outcome, announcement_id: announcement.id});
}
