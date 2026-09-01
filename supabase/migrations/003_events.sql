-- Public bootcamps/webinars, their registrations, and admin flyer uploads.
-- Run after 001_learning_engine.sql and 002_application_emails.sql.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text not null check (char_length(trim(description)) between 10 and 5000),
  event_type text not null check (event_type in ('webinar', 'bootcamp')),
  flyer_url text,
  application_deadline timestamptz,
  event_starts_at timestamptz,
  event_ends_at timestamptz,
  call_link text,
  registration_mode text not null default 'website' check (registration_mode in ('website', 'luma')),
  luma_url text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_registration_link_check check (
    (registration_mode = 'website') or (luma_url is not null and char_length(trim(luma_url)) > 0)
  )
);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  email text not null,
  whatsapp text not null check (char_length(trim(whatsapp)) between 5 and 50),
  is_in_community_whatsapp boolean not null,
  wants_community_add boolean not null default false,
  referral_source text not null check (char_length(trim(referral_source)) between 2 and 200),
  consent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);

create index if not exists events_public_active_idx on public.events (event_type, is_active, application_deadline);
create index if not exists event_registrations_event_created_idx on public.event_registrations (event_id, created_at desc);

alter table public.events enable row level security;
alter table public.event_registrations enable row level security;

drop policy if exists "public read active events" on public.events;
drop policy if exists "admins manage events" on public.events;
drop policy if exists "public register for active events" on public.event_registrations;
drop policy if exists "admins read registrations" on public.event_registrations;
create policy "public read active events" on public.events for select using (is_active = true);
create policy "admins manage events" on public.events for all using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "public register for active events" on public.event_registrations for insert with check (
  consent = true and exists (select 1 from public.events e where e.id = event_id and e.is_active = true and e.registration_mode = 'website' and (e.application_deadline is null or e.application_deadline >= now()))
);
create policy "admins read registrations" on public.event_registrations for select using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Flyers are publicly readable so public cards can display them. Only admins may upload,
-- replace, or remove files inside this dedicated bucket.
insert into storage.buckets (id, name, public) values ('event-flyers', 'event-flyers', true) on conflict (id) do update set public = true;
drop policy if exists "public read event flyers" on storage.objects;
drop policy if exists "admins upload event flyers" on storage.objects;
drop policy if exists "admins update event flyers" on storage.objects;
drop policy if exists "admins delete event flyers" on storage.objects;
create policy "public read event flyers" on storage.objects for select using (bucket_id = 'event-flyers');
create policy "admins upload event flyers" on storage.objects for insert with check (bucket_id = 'event-flyers' and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins update event flyers" on storage.objects for update using (bucket_id = 'event-flyers' and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check (bucket_id = 'event-flyers' and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins delete event flyers" on storage.objects for delete using (bucket_id = 'event-flyers' and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Initial public cohort from the supplied campaign flyer. The call link can be
-- added in Admin when it is confirmed; the supplied flyer itself can be uploaded
-- there to avoid committing a private desktop asset to the repository.
insert into public.events (title, description, event_type, application_deadline, event_starts_at, event_ends_at, is_active)
select 'Testing the Cloud Native Waters', 'An 8-week Cloud Native bootcamp for beginners. Build real skills, challenge yourself, and learn with mentors across Africa. Sessions run every Saturday.', 'bootcamp', '2026-09-18T23:59:59+00', '2026-09-19T09:00:00+00', '2026-11-07T17:00:00+00', true
where not exists (select 1 from public.events where title = 'Testing the Cloud Native Waters');
