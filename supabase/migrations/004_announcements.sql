-- Admin-created announcements and their delivery audit. Safe to run after 001.
alter table public.announcements add column if not exists email_sent_at timestamptz;
alter table public.announcements add column if not exists email_recipient_count integer not null default 0;
alter table public.announcements add column if not exists email_failure_count integer not null default 0;

drop policy if exists "admins manage announcements" on public.announcements;
create policy "admins manage announcements" on public.announcements for all
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
