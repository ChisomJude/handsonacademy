import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {deliverQueued} from '@/lib/email/send';

// "Deliver queued now" on the announcements page: the same drain the cron runs,
// for an admin who does not want to wait for it. It still respects the daily
// bulk ceiling, so pressing it cannot overrun the quota.
export const maxDuration = 60;

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return NextResponse.json({error: 'Admin access required'}, {status: 403});
  const outcome = await deliverQueued();
  return NextResponse.json({ok: true, ...outcome});
}
