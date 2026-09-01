import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {sendEmail} from '@/lib/email/send';
import {eventRegistrationEmail} from '@/lib/email/templates';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+0-9()\s-]{5,50}$/;
function text(value: unknown, minimum: number, maximum: number) { return typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum ? value.trim() : null; }

async function verifyTurnstile(token?: string) {
  if (!process.env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({secret: process.env.TURNSTILE_SECRET_KEY, response: token})});
  return Boolean((await response.json() as {success?: boolean}).success);
}

export async function POST(request: Request) {
  let body: Record<string, string | boolean | undefined>;
  try { body = await request.json() as Record<string, string | boolean | undefined>; } catch { return NextResponse.json({error: 'Invalid request.'}, {status: 400}); }
  const eventId = text(body.event_id, 36, 36), fullName = text(body.full_name, 2, 160), email = text(body.email, 3, 254)?.toLowerCase(), whatsapp = text(body.whatsapp, 5, 50), referralSource = text(body.referral_source, 2, 200);
  if (!eventId || !UUID.test(eventId) || !fullName || !email || !EMAIL.test(email) || !whatsapp || !PHONE.test(whatsapp) || !referralSource) return NextResponse.json({error: 'Enter a valid name, email, WhatsApp number, and referral source.'}, {status: 400});
  if (body.consent !== true) return NextResponse.json({error: 'Please confirm that we may contact you about this event.'}, {status: 400});
  if (!await verifyTurnstile(typeof body.turnstile_token === 'string' ? body.turnstile_token : undefined)) return NextResponse.json({error: 'Please complete the bot check and try again.'}, {status: 400});

  const supabase = await createSupabaseServerClient();
  const {data: event, error: eventError} = await supabase.from('events').select('*').eq('id', eventId).eq('is_active', true).single();
  if (eventError || !event || event.registration_mode !== 'website' || (event.application_deadline && new Date(event.application_deadline).getTime() < Date.now())) return NextResponse.json({error: 'This event is not currently accepting applications.'}, {status: 409});
  const registration = {event_id: eventId, full_name: fullName, email, whatsapp, is_in_community_whatsapp: body.is_in_community_whatsapp === true, wants_community_add: body.wants_community_add === true, referral_source: referralSource, consent: true};
  const {error} = await supabase.from('event_registrations').insert(registration);
  if (error?.code === '23505') return NextResponse.json({error: 'You are already registered for this event with this email address.'}, {status: 409});
  if (error) return NextResponse.json({error: error.message}, {status: 500});
  await sendEmail(eventRegistrationEmail(registration, event));
  return NextResponse.json({received: true}, {status: 201});
}
