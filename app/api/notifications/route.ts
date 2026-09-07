import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';

/** The learner's own inbox. RLS scopes every row to the signed-in account. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  const {data, error} = await supabase.from('notifications')
    .select('id,kind,title,body,link,created_at,read_at')
    .order('created_at', {ascending: false}).limit(30);
  if (error) return NextResponse.json({error: error.message}, {status: 500});
  return NextResponse.json({notifications: data, unread: (data || []).filter(row => !row.read_at).length});
}

/** Marks one notification read, or all of them with {all: true}. */
export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  let body: {id?: string; all?: boolean};
  try { body = await request.json() as {id?: string; all?: boolean}; } catch { return NextResponse.json({error: 'Invalid request.'}, {status: 400}); }

  const update = supabase.from('notifications').update({read_at: new Date().toISOString()}).is('read_at', null);
  const {error} = body.all ? await update.eq('user_id', user.id) : body.id ? await update.eq('id', body.id) : {error: {message: 'id or all is required'}};
  if (error) return NextResponse.json({error: error.message}, {status: 400});
  return NextResponse.json({ok: true});
}
