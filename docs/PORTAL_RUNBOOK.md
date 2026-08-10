# HandsOn Academy portal runbook

## Current hosting model

The frontend and API route handlers run together on Vercel. The learner browser calls `/api/progress` and `/api/submissions` on the same domain, and those handlers use Supabase Auth/Postgres. Render is not required for the current free-course portal. Add a Render service only if you later need a separate long-running API or worker.

## One-time Supabase setup

1. Run `supabase/migrations/001_learning_engine.sql` in the Supabase SQL Editor. It is safe to rerun and recreates policies without deleting tables or course data.
2. Set your own account as admin (replace the email):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where email = 'you@example.com';
```

3. Sign out and sign back in so the refreshed JWT contains the admin role.

## Vercel variables

Set these for Production and Preview, then redeploy:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
NEXT_PUBLIC_SITE_URL=https://handsonacademy.org.ng
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<Cloudflare Turnstile site key>
TURNSTILE_SECRET_KEY=<Cloudflare Turnstile secret key>
```

Turnstile keys are required before enabling bot protection on public forms. Create a Cloudflare Turnstile widget restricted to `handsonacademy.org.ng` and provide its site key and secret key in Vercel. Never expose the secret key in client code.

## Smoke test

1. Visit `/login` and sign in with Google.
2. Open `/dashboard`, choose either free track, open a mission, complete the checklist, and submit evidence.
3. Open `/admin/submissions` with the admin account and approve or request changes.
4. Confirm the dashboard mission count changes after completion.

Payments are intentionally not included. Both tracks and all seeded missions are free.
