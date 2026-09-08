import Link from 'next/link';
import {redirect} from 'next/navigation';
import {ArrowLeft} from 'lucide-react';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {SubmissionQueue, type QueueRow} from '@/components/admin/submission-queue';
import {missionContext, trackStage, type SubmissionMessage} from '@/lib/submissions';

export const metadata = {title: 'Submission Review'};

const FULL = 'id,user_id,mission_id,evidence,status,reviewer_notes,reviewed_at,reviewed_by_email,rating,rating_comment,created_at';
const LEGACY = 'id,user_id,mission_id,evidence,status,reviewer_notes,reviewed_at,created_at';

export default async function Submissions() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect('/admin');
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/admin');

  // Migration 006 adds the rating and thread columns. Until it runs, fall back to the
  // original shape so the queue keeps working rather than erroring out entirely.
  type RawSubmission = {
    id: string; user_id: string; mission_id: string; evidence: string;
    status: 'pending' | 'approved' | 'needs_changes'; reviewer_notes: string | null;
    reviewed_at: string | null; created_at: string;
    reviewed_by_email?: string | null; rating?: number | null; rating_comment?: string | null;
  };
  let limited = false;
  let rows: RawSubmission[] = [];
  const full = await supabase.from('submissions').select(FULL).order('created_at', {ascending: false}).limit(500);
  if (full.error) {
    limited = true;
    const legacy = await supabase.from('submissions').select(LEGACY).order('created_at', {ascending: false}).limit(500);
    if (legacy.error) return <section className="shell section"><p role="alert" style={{color: '#b9462b'}}>{legacy.error.message}</p></section>;
    rows = (legacy.data || []) as RawSubmission[];
  } else {
    rows = (full.data || []) as RawSubmission[];
  }
  const userIds = [...new Set(rows.map(row => row.user_id))];
  const [profiles, messages, progress] = await Promise.all([
    userIds.length ? supabase.from('profiles').select('id,display_name,email').in('id', userIds) : Promise.resolve({data: []}),
    !limited && rows.length
      ? supabase.from('submission_messages').select('id,submission_id,author_role,author_name,body,created_at').in('submission_id', rows.map(row => row.id)).order('created_at')
      : Promise.resolve({data: []}),
    userIds.length ? supabase.from('mission_progress').select('user_id,mission_id').eq('status', 'completed').in('user_id', userIds) : Promise.resolve({data: []}),
  ]);

  const named = new Map((profiles.data || []).map(row => [row.id, row]));
  const thread = new Map<string, SubmissionMessage[]>();
  for (const message of (messages.data || []) as SubmissionMessage[]) {
    thread.set(message.submission_id, [...(thread.get(message.submission_id) || []), message]);
  }
  const completedBy = new Map<string, string[]>();
  for (const row of (progress.data || []) as {user_id: string; mission_id: string}[]) {
    completedBy.set(row.user_id, [...(completedBy.get(row.user_id) || []), row.mission_id]);
  }

  const queue: QueueRow[] = rows.map(row => {
    const context = missionContext(row.mission_id);
    const profile = named.get(row.user_id);
    return {
      ...row,
      rating: 'rating' in row ? row.rating : null,
      rating_comment: 'rating_comment' in row ? row.rating_comment : null,
      reviewed_by_email: 'reviewed_by_email' in row ? row.reviewed_by_email : null,
      learnerName: profile?.display_name || 'Unnamed learner',
      learnerEmail: profile?.email || null,
      context,
      stage: trackStage(context.trackSlug, completedBy.get(row.user_id) || []),
      messages: thread.get(row.id) || [],
    } as QueueRow;
  });

  const pending = queue.filter(row => row.status === 'pending').length;
  return <section className="shell section">
    <Link href="/admin" style={{fontSize: 13, color: 'var(--muted)', display: 'inline-flex', gap: 7, alignItems: 'center'}}><ArrowLeft size={15} /> Admin overview</Link>
    <span className="eyebrow" style={{display: 'block', marginTop: 30}}>Review queue</span>
    <h1>Submissions</h1>
    <p className="lede">{pending} waiting for review. Approving is encouragement, not a gate. Learners move to the next mission as soon as they submit.</p>
    {limited && <div className="card" style={{padding: 18, marginTop: 20}}><p style={{margin: 0, fontWeight: 700, color: '#b9462b'}}>Migration 006 has not reached this database yet.</p><p className="lede" style={{fontSize: 14, margin: '6px 0 0'}}>Ratings, replies, and learner notifications stay hidden until the <b>Database migrations</b> workflow runs.</p></div>}
    <SubmissionQueue rows={queue} limited={limited} />
  </section>;
}
