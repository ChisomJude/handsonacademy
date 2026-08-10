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
  const {data, error} = await supabase.from('community_inquiries').insert({kind: body.kind, full_name: body.full_name!.trim(), email: body.email!.trim().toLowerCase(), phone: body.phone!.trim(), country: body.country?.trim() || null, organization: body.organization?.trim() || null, focus: body.focus?.trim() || null, message: body.message!.trim(), consent: true}).select('id').single();
  if (error) return NextResponse.json({error: error.message}, {status: 500});
  return NextResponse.json({inquiry: data}, {status: 201});
}
