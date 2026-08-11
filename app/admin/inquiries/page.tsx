import Link from 'next/link';
import {redirect} from 'next/navigation';
import {ArrowLeft} from 'lucide-react';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {InquiryTable, type Inquiry} from '@/components/admin/inquiry-table';

export const metadata = {title: 'Community inquiries'};

export default async function Inquiries() {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/admin');
  const {data, error} = await supabase.from('community_inquiries').select('*').order('created_at', {ascending: false});

  return <section className="shell section">
    <Link href="/admin" style={{fontSize: 13, color: 'var(--muted)', display: 'inline-flex', gap: 7, alignItems: 'center'}}><ArrowLeft size={15} /> Admin overview</Link>
    <span className="eyebrow" style={{display: 'block', marginTop: 30}}>Follow-up inbox</span>
    <h1>Community inquiries</h1>
    <p className="lede">Approve learner applications before portal access, or follow up with sponsors, mentors and speakers. Select several rows to act on them together.</p>
    {error ? <p role="alert" style={{color: '#b9462b'}}>{error.message}</p> : <InquiryTable initial={(data || []) as Inquiry[]} />}
  </section>;
}
