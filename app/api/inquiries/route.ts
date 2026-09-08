import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';

export async function POST(request: Request) {
  const body = await request.json() as Record<string, string | undefined>;
  const required = ['kind','full_name','email','phone','message'];
  if (required.some(key => !body[key]?.trim())) return NextResponse.json({error: 'Name, email, phone, and message are required.'}, {status: 400});
  if (body.consent !== 'true') return NextResponse.json({error: 'Please confirm how your information may be used.'}, {status: 400});
  if (process.env.TURNSTILE_SECRET_KEY) { const token = body.turnstile_token; if (!token) return NextResponse.json({error: 'Please complete the bot check.'}, {status: 400}); const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({secret:process.env.TURNSTILE_SECRET_KEY,response:token})}); const result = await verification.json() as {success?:boolean}; if (!result.success) return NextResponse.json({error:'Bot verification failed. Please try again.'},{status:400}); }
  if (!['sponsor','mentor','learner'].includes(body.kind!)) return NextResponse.json({error: 'Invalid inquiry type.'}, {status: 400});
  const supabase = await createSupabaseServerClient();
  const inquiry = {kind: body.kind!, full_name: body.full_name!.trim(), email: body.email!.trim().toLowerCase(), phone: body.phone!.trim(), country: body.country?.trim() || null, organization: body.organization?.trim() || null, focus: body.focus?.trim() || null, message: body.message!.trim(), consent: true};
  // No .select() here on purpose. Chaining one makes PostgREST emit INSERT ...
  // RETURNING, and RLS applies the SELECT policies to returned rows, neither of
  // which a public applicant can satisfy, so the insert fails with "new row violates
  // row-level security policy" even though the INSERT policy allows it. Nothing
  // downstream needs the generated id.
  const {error} = await supabase.from('community_inquiries').insert(inquiry);
  // 23505 is the partial unique index from migration 002: one live learner
  // application per email. Repeat submissions are answered, not recorded twice.
  if (error?.code === '23505') return NextResponse.json({error: 'We already have an application from this email address. Watch your inbox. We reply to every applicant.'}, {status: 409});
  if (error) return NextResponse.json({error: error.message}, {status: 500});

  // Applying sends no email to anyone, applicant or admin. The approval email is the
  // only message this system ever produces for a learner, which holds email spend to
  // one per admitted learner. New applications are found in /admin/inquiries.
  return NextResponse.json({received: true}, {status: 201});
}
