-- Admin access by invitation, replacing the manual
-- `update auth.users set raw_app_meta_data ...` step in the runbook.
--
-- An existing admin records a name and email. When that person signs in with Google
-- using that address, they are promoted automatically. Google is the verification:
-- Supabase issues a session only after Google asserts the address belongs to them,
-- so holding the mailbox is what proves identity. There is no invite token to leak,
-- and no service-role key in the application -- promotion happens inside security
-- definer functions, the only thing in this project allowed to write auth.users.
-- Every one of them re-checks the caller, because a definer function is otherwise a
-- free privilege escalation for any signed-in user.
--
-- Rerun-safe, like every migration here: see docs/PORTAL_RUNBOOK.md.

create table if not exists public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (position('@' in email) > 1),
  full_name text not null,
  invited_by uuid references auth.users(id) on delete set null,
  invited_by_email text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by_email text
);

-- One live invite per address. Revoked rows stay put as the audit trail of who
-- granted access and who removed it.
create unique index if not exists admin_invites_live_email_idx
  on public.admin_invites (lower(email)) where revoked_at is null;
create index if not exists admin_invites_created_at_idx on public.admin_invites (created_at desc);

alter table public.admin_invites enable row level security;
drop policy if exists "admins read invites" on public.admin_invites;
drop policy if exists "admins write invites" on public.admin_invites;
create policy "admins read invites" on public.admin_invites for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins write invites" on public.admin_invites for all
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Private helper. Sets or clears the role claim that every admin check in the app
-- reads. Never granted to a client role; only the functions below call it.
create or replace function public.set_admin_role(target_email text, make_admin boolean)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare touched integer;
begin
  update auth.users set raw_app_meta_data = case
      when make_admin then coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
      else coalesce(raw_app_meta_data, '{}'::jsonb) - 'role' end
  where lower(email) = lower(target_email);
  get diagnostics touched = row_count;
  return touched > 0;
end $function$;
revoke all on function public.set_admin_role(text, boolean) from public, anon, authenticated;

-- Called by an admin to invite someone. When that person already has an account the
-- promotion lands immediately; otherwise the invite waits for their first sign-in.
create or replace function public.invite_admin(target_email text, target_name text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare clean_email text; clean_name text; caller_email text; promoted boolean; invite_id uuid;
begin
  if coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  clean_email := lower(btrim(target_email));
  clean_name := btrim(target_name);
  if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'a valid email address is required' using errcode = '22023';
  end if;
  if length(clean_name) < 2 then
    raise exception 'a name of at least 2 characters is required' using errcode = '22023';
  end if;
  select email into caller_email from auth.users where id = auth.uid();

  insert into public.admin_invites (email, full_name, invited_by, invited_by_email)
  values (clean_email, clean_name, auth.uid(), caller_email)
  on conflict (lower(email)) where revoked_at is null
  do update set full_name = excluded.full_name, invited_by = excluded.invited_by,
                invited_by_email = excluded.invited_by_email
  returning id into invite_id;

  -- Promote now when the account already exists, so an existing learner or teammate
  -- becomes an admin without waiting for another sign-in.
  promoted := public.set_admin_role(clean_email, true);
  if promoted then
    update public.admin_invites
    set accepted_at = coalesce(accepted_at, now()),
        accepted_user_id = (select id from auth.users where lower(email) = clean_email)
    where id = invite_id;
  end if;
  return jsonb_build_object('invite_id', invite_id, 'email', clean_email, 'promoted', promoted);
end $function$;
revoke all on function public.invite_admin(text, text) from public, anon;
grant execute on function public.invite_admin(text, text) to authenticated;

-- Called for the signing-in user by the app's admission gate. Promotes only the
-- caller, and only against an invite an admin already created for the caller's own
-- Google-verified address, so it cannot be used to grant anyone anything.
create or replace function public.claim_admin_invite()
returns boolean language plpgsql security definer set search_path = '' as $function$
declare caller_email text; caller_confirmed timestamptz; invite_id uuid;
begin
  select email, email_confirmed_at into caller_email, caller_confirmed
  from auth.users where id = auth.uid();
  if caller_email is null or caller_confirmed is null then return false; end if;
  select id into invite_id from public.admin_invites
  where lower(email) = lower(caller_email) and revoked_at is null limit 1;
  if invite_id is null then return false; end if;
  perform public.set_admin_role(caller_email, true);
  update public.admin_invites
  set accepted_at = coalesce(accepted_at, now()), accepted_user_id = auth.uid()
  where id = invite_id;
  return true;
end $function$;
revoke all on function public.claim_admin_invite() from public, anon;
grant execute on function public.claim_admin_invite() to authenticated;

-- Removing access. Refuses the two moves that lock everybody out: removing yourself,
-- and removing the last remaining admin.
create or replace function public.revoke_admin(target_email text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare clean_email text; caller_email text; admin_count integer; cleared boolean;
begin
  if coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  clean_email := lower(btrim(target_email));
  select email into caller_email from auth.users where id = auth.uid();
  if lower(coalesce(caller_email, '')) = clean_email then
    raise exception 'you cannot remove your own admin access' using errcode = '22023';
  end if;
  select count(*) into admin_count from auth.users where raw_app_meta_data ->> 'role' = 'admin';
  if admin_count <= 1 and exists (
    select 1 from auth.users
    where lower(email) = clean_email and raw_app_meta_data ->> 'role' = 'admin'
  ) then
    raise exception 'at least one admin must remain' using errcode = '22023';
  end if;
  cleared := public.set_admin_role(clean_email, false);
  update public.admin_invites
  set revoked_at = now(), revoked_by_email = caller_email
  where lower(email) = clean_email and revoked_at is null;
  return jsonb_build_object('email', clean_email, 'cleared', cleared);
end $function$;
revoke all on function public.revoke_admin(text) from public, anon;
grant execute on function public.revoke_admin(text) to authenticated;

-- The admin list lives in auth.users, which PostgREST cannot read. Admin-only view
-- of just the fields the team page shows.
create or replace function public.list_admins()
returns table (email text, full_name text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = '' as $function$
begin
  if coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query
    select u.email::text,
           coalesce(
             nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
             (select i.full_name from public.admin_invites i
              where lower(i.email) = lower(u.email) order by i.created_at desc limit 1),
             split_part(u.email, '@', 1)
           )::text,
           u.created_at, u.last_sign_in_at
    from auth.users u
    where u.raw_app_meta_data ->> 'role' = 'admin'
    order by u.created_at;
end $function$;
revoke all on function public.list_admins() from public, anon;
grant execute on function public.list_admins() to authenticated;
