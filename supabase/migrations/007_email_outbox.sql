-- Email outbox: every message the portal sends passes through this table, so the
-- app can honour Resend's free-tier limits instead of discovering them as 429s.
--
-- The limits that matter: 100 emails per UTC calendar day (resets at 00:00 UTC),
-- 25 API requests per second (raised from 10 on request), and up to 100 emails in one batch request. The app
-- keeps a daily ceiling of 90 for bulk mail (announcements, event updates) so that
-- ten slots stay free for the emails a person is waiting on right then: event
-- registration confirmations, application decisions, admin invites. Anything that
-- does not fit today stays `queued` and the daily cron (see vercel.json) sends it
-- after the quota resets.
--
-- Rendered subject/html/text are stored on the row so delivery never depends on
-- the request that created it -- the cron has no session and no form data.
--
-- Rerun-safe, like every migration here: see docs/PORTAL_RUNBOOK.md.

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('transactional', 'announcement', 'event_update')),
  -- 0 = someone is waiting for it, 1 = bulk. Lower goes first when the queue drains.
  priority smallint not null default 1,
  to_email text not null check (position('@' in to_email) > 1),
  subject text not null,
  html text not null,
  text_body text not null,
  reply_to text,
  announcement_id uuid references public.announcements(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  -- Resend's id for the email, for tracing a delivery in their dashboard.
  provider_id text,
  -- The UTC day this row was counted against. Set when claimed, cleared if the
  -- send fails and the row goes back to the queue.
  sent_day date,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_outbox_queue_idx
  on public.email_outbox (priority, created_at) where status = 'queued';
create index if not exists email_outbox_day_idx
  on public.email_outbox (sent_day, status);
create index if not exists email_outbox_announcement_idx
  on public.email_outbox (announcement_id) where announcement_id is not null;

alter table public.email_outbox enable row level security;
-- Admins may look (the announcements page shows queue depth and today's usage).
-- Nobody writes through PostgREST: the app writes with the service-role client,
-- which bypasses RLS, and only lib/email holds that client.
drop policy if exists "admins read outbox" on public.email_outbox;
create policy "admins read outbox" on public.email_outbox for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- How many of an announcement's recipients are still waiting for a quota window.
alter table public.announcements add column if not exists email_queued_count integer not null default 0;

-- Claims up to `batch_limit` queued rows, never more than `daily_cap` minus what
-- has already been counted against today (UTC). Rows come back marked `sending`
-- so a concurrent caller cannot claim them too; the advisory lock makes the
-- count-then-claim atomic across callers, which is what keeps two admins clicking
-- Send at once, or an admin racing the cron, from overrunning the cap.
--
-- `only_ids` restricts the claim to specific rows: the transactional path uses it
-- to ask "may this one email go out right now?".
--
-- Claims older than 30 minutes are treated as a crashed run and released first.
-- The app sends every request with an idempotency key derived from the row ids,
-- so a release-and-retry inside Resend's 24-hour idempotency window cannot send
-- the same email twice.
create or replace function public.email_outbox_claim(daily_cap integer, batch_limit integer, only_ids uuid[] default null)
returns setof public.email_outbox
language plpgsql security definer set search_path = '' as $function$
declare today date := (now() at time zone 'utc')::date; used integer; room integer;
begin
  perform pg_advisory_xact_lock(hashtext('public.email_outbox_claim'));

  update public.email_outbox
  set status = 'queued', claimed_at = null, sent_day = null, attempts = attempts + 1, last_error = 'stalled'
  where status = 'sending' and claimed_at < now() - interval '30 minutes';

  select count(*) into used from public.email_outbox
  where sent_day = today and status in ('sending', 'sent');
  room := least(batch_limit, daily_cap - used);
  if room <= 0 then return; end if;

  return query
  update public.email_outbox o
  set status = 'sending', claimed_at = now(), sent_day = today
  where o.id in (
    select q.id from public.email_outbox q
    where q.status = 'queued' and (only_ids is null or q.id = any(only_ids))
    order by q.priority, q.created_at
    limit room
    for update skip locked
  )
  returning o.*;
end $function$;
revoke all on function public.email_outbox_claim(integer, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.email_outbox_claim(integer, integer, uuid[]) to service_role;

-- Today's usage, for the admin page: how many slots are used and how many wait.
-- Admin-only, re-checked here because a definer function ignores RLS.
create or replace function public.email_outbox_status()
returns table (sent_today integer, queued integer, failed integer)
language plpgsql security definer set search_path = '' as $function$
begin
  if coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin'
     and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query select
    (select count(*)::integer from public.email_outbox
      where sent_day = (now() at time zone 'utc')::date and status in ('sending', 'sent')),
    (select count(*)::integer from public.email_outbox where status = 'queued'),
    (select count(*)::integer from public.email_outbox where status = 'failed');
end $function$;
revoke all on function public.email_outbox_status() from public, anon;
grant execute on function public.email_outbox_status() to authenticated, service_role;

-- Keeps the announcement's delivery counters in step with its outbox rows, so the
-- announcements page tells the truth after the cron sends the second half.
create or replace function public.email_outbox_sync_announcements(ids uuid[])
returns void language sql security definer set search_path = '' as $function$
  update public.announcements a
  set email_recipient_count = s.sent, email_failure_count = s.failed, email_queued_count = s.waiting,
      email_sent_at = coalesce(a.email_sent_at, s.first_sent)
  from (
    select announcement_id,
           count(*) filter (where status = 'sent')::integer as sent,
           count(*) filter (where status = 'failed')::integer as failed,
           count(*) filter (where status in ('queued', 'sending'))::integer as waiting,
           min(sent_at) as first_sent
    from public.email_outbox
    where announcement_id in (select distinct o.announcement_id from public.email_outbox o where o.id = any(ids) and o.announcement_id is not null)
    group by announcement_id
  ) s
  where a.id = s.announcement_id;
$function$;
revoke all on function public.email_outbox_sync_announcements(uuid[]) from public, anon, authenticated;
grant execute on function public.email_outbox_sync_announcements(uuid[]) to service_role;

-- Records a successful batch: ids and provider_ids are parallel arrays in the
-- order Resend returned them.
create or replace function public.email_outbox_mark_sent(ids uuid[], provider_ids text[])
returns void language plpgsql security definer set search_path = '' as $function$
begin
  update public.email_outbox o
  set status = 'sent', sent_at = now(), provider_id = p.provider_id, last_error = null
  from unnest(ids, provider_ids) as p(id, provider_id)
  where o.id = p.id;
  perform public.email_outbox_sync_announcements(ids);
end $function$;
revoke all on function public.email_outbox_mark_sent(uuid[], text[]) from public, anon, authenticated;
grant execute on function public.email_outbox_mark_sent(uuid[], text[]) to service_role;

-- Records a failed request. A retryable failure (rate limit, quota, network) puts
-- the rows back in the queue for the next window, up to three attempts; anything
-- else, or a third strike, is final and shows up in the admin failed count.
create or replace function public.email_outbox_mark_failed(ids uuid[], reason text, retryable boolean)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  update public.email_outbox
  set attempts = attempts + 1,
      last_error = left(reason, 1000),
      claimed_at = null,
      status = case when retryable and attempts + 1 < 3 then 'queued' else 'failed' end,
      sent_day = case when retryable and attempts + 1 < 3 then null else sent_day end
  where id = any(ids);
  perform public.email_outbox_sync_announcements(ids);
end $function$;
revoke all on function public.email_outbox_mark_failed(uuid[], text, boolean) from public, anon, authenticated;
grant execute on function public.email_outbox_mark_failed(uuid[], text, boolean) to service_role;
