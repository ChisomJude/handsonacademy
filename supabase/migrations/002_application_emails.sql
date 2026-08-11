-- HandsOn Academy application email + integrity pass. Safe to rerun.
-- Adds the bookkeeping the transactional email flow needs, and closes the gap that
-- lets a single person hold two approved applications (which locks them out of the
-- portal at sign-in — see app/auth/callback/route.ts).

-- Records when a decision email actually left, so re-clicking Approve in the admin
-- inbox never sends an applicant a second copy.
alter table public.community_inquiries add column if not exists decision_email_sent_at timestamptz;
alter table public.community_inquiries add column if not exists status_updated_at timestamptz;

-- The sign-in gate filters on kind + email + status; the follow-up inbox orders by
-- created_at. Neither had an index.
create index if not exists community_inquiries_lookup_idx on public.community_inquiries (kind, lower(email), status);
create index if not exists community_inquiries_created_at_idx on public.community_inquiries (created_at desc);

-- Retire pre-existing duplicates before the unique index below can be created.
-- Nothing is deleted: older rows are moved to 'closed' and annotated, keeping the
-- approved row where one exists and otherwise the most recent submission.
with ranked as (
  select id, row_number() over (
    partition by lower(email)
    order by (status = 'approved') desc, created_at desc
  ) as rn
  from public.community_inquiries
  where kind = 'learner' and status in ('new', 'approved', 'contacted')
)
update public.community_inquiries as c
set status = 'closed',
    admin_notes = coalesce(c.admin_notes || ' | ', '') || 'Auto-closed duplicate application (migration 002).'
from ranked as r
where c.id = r.id and r.rn > 1;

-- One live learner application per email address. Rejected, blocked, and closed rows
-- are excluded, so someone turned down for one cohort can still apply to the next.
-- The API turns the resulting unique violation into a friendly message.
create unique index if not exists community_inquiries_live_learner_idx
  on public.community_inquiries (lower(email))
  where kind = 'learner' and status in ('new', 'approved', 'contacted');
