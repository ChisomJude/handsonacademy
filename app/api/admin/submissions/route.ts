import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({error: 'Admin access required'}, {status: 403});
  }

  const body = await request.json() as {id?: string; status?: 'approved' | 'needs_changes'; reviewer_notes?: string};
  if (!body.id || !body.status) {
    return NextResponse.json({error: 'id and status are required'}, {status: 400});
  }

  const {data, error} = await supabase
    .from('submissions')
    .update({status: body.status, reviewer_notes: body.reviewer_notes?.trim() || null, reviewed_at: new Date().toISOString()})
    .eq('id', body.id)
    .select()
    .single();

  if (error) return NextResponse.json({error: error.message}, {status: 500});
  return NextResponse.json({submission: data});
}
