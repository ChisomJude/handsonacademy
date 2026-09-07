-- Turns a submission from a one-way drop box into a conversation.
--
-- Three gaps this closes:
--   1. Admins saw a raw user_id and could not tell who submitted. profiles gains an
--      email column and an admin read policy, so the review queue can name people.
--   2. Nothing came back to the learner. submission_messages is the thread on each
--      submission, and notifications is what the learner sees on next sign-in.
--   3. Feedback only ran one way. A learner now rates the module they finished, and
--      that rating rides along with the evidence.
--
-- Progression is deliberately untouched: mission_progress is written the moment
-- evidence is submitted, so a submission waiting for review never blocks the next
-- mission. Review is feedback, not a gate.
--
-- Rerun-safe, like every migration here: see docs/PORTAL_RUNBOOK.md.

-- 1. Who submitted -----------------------------------------------------------

alter table public.profiles add column if not exists email text;

-- Backfill from the auth record, and keep the app's upsert authoritative after that.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

create index if not exists profiles_email_idx on public.profiles (lower(email));

drop policy if exists "admins read profiles" on public.profiles;
create policy "admins read profiles" on public.profiles for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 2. How the learner rated the module ----------------------------------------

alter table public.submissions add column if not exists rating smallint;
alter table public.submissions drop constraint if exists submissions_rating_check;
alter table public.submissions add constraint submissions_rating_check
  check (rating is null or rating between 1 and 5);
alter table public.submissions add column if not exists rating_comment text;
alter table public.submissions drop constraint if exists submissions_rating_comment_check;
alter table public.submissions add constraint submissions_rating_comment_check
  check (rating_comment is null or char_length(rating_comment) <= 2000);
alter table public.submissions add column if not exists reviewed_by_email text;

create index if not exists submissions_user_created_idx on public.submissions (user_id, created_at desc);
create index if not exists submissions_status_idx on public.submissions (status, created_at desc);

-- 3. The thread on a submission ----------------------------------------------

create table if not exists public.submission_messages (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_role text not null check (author_role in ('admin', 'learner')),
  author_name text,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists submission_messages_thread_idx
  on public.submission_messages (submission_id, created_at);

alter table public.submission_messages enable row level security;
drop policy if exists "learners read own thread" on public.submission_messages;
drop policy if exists "learners reply on own thread" on public.submission_messages;
drop policy if exists "admins read all threads" on public.submission_messages;
drop policy if exists "admins write all threads" on public.submission_messages;

-- A learner sees and answers only threads hanging off their own submissions.
create policy "learners read own thread" on public.submission_messages for select
  using (exists (select 1 from public.submissions s where s.id = submission_id and s.user_id = auth.uid()));
create policy "learners reply on own thread" on public.submission_messages for insert
  with check (
    author_id = auth.uid() and author_role = 'learner'
    and exists (select 1 from public.submissions s where s.id = submission_id and s.user_id = auth.uid())
  );
create policy "admins read all threads" on public.submission_messages for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins write all threads" on public.submission_messages for insert
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' and author_role = 'admin');

-- 4. What the learner sees on their next sign-in ------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'submission' check (kind in ('submission', 'announcement', 'system')),
  title text not null,
  body text,
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_inbox_idx on public.notifications (user_id, read_at, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "users read own notifications" on public.notifications;
drop policy if exists "users mark own notifications read" on public.notifications;
drop policy if exists "admins send notifications" on public.notifications;
create policy "users read own notifications" on public.notifications for select
  using (user_id = auth.uid());
create policy "users mark own notifications read" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admins send notifications" on public.notifications for insert
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
