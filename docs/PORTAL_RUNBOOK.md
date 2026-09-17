# HandsOn Academy portal runbook

## Current hosting model

The frontend and API route handlers run together on Vercel. The learner browser calls `/api/progress` and `/api/submissions` on the same domain, and those handlers use Supabase Auth/Postgres. Render is not required for the current free-course portal. Add a Render service only if you later need a separate long-running API or worker.

## Database migrations

**Migrations apply themselves.** `.github/workflows/database-migrations.yml` replays every file in `supabase/migrations/` against production whenever a push to `master` touches that folder, and on demand from the Actions tab (**Run workflow**). Nothing needs pasting into the SQL Editor any more.

Every migration is written to be rerun safely — `create table if not exists`, `add column if not exists`, `drop policy if exists` before each `create policy`, seed rows guarded by `on conflict` or `not exists` — so replaying the whole set on a current database is a no-op. That is what lets the workflow stay stateless rather than tracking which files have run, and it is the rule to follow when adding `005` and beyond. Each file is applied with `--single-transaction`, so a failing statement rolls its whole file back instead of leaving the schema half-changed.

### One-time setup for the workflow

Add one repository secret under **Settings → Secrets and variables → Actions**:

| Secret | Where it comes from |
| --- | --- |
| `SUPABASE_DB_URL` | Supabase → Project Settings → Database → Connection string → **Session pooler**, with the database password filled in |

Use the **Session pooler** URI, not the direct `db.<ref>.supabase.co` one: direct connections are IPv6-only and GitHub-hosted runners have no IPv6 route, so the direct host times out. The secret carries the database password, so it belongs nowhere except GitHub secrets.

### Ordering against the app deploy

Vercel builds from the same push, in parallel with this workflow, so a migration is not guaranteed to land before the code that needs it. Migrations here are additive (new tables, new nullable columns), which tolerates either order. When a change is **not** additive — a column the new code cannot run without, like `status_updated_at` was for migration 002 — run the workflow manually from the Actions tab first, confirm it is green, and only then merge the code. To remove the race permanently, turn off Vercel's Git auto-deploy and add a deploy job to this workflow that runs after `apply`.

### Adding a migration

1. Write `supabase/migrations/005_your_change.sql` in the rerun-safe style above.
2. Push to `master`. The workflow applies it and lists what it ran in the job summary.
3. Watch the run. A red run means production did not get the change — read the log, fix the SQL, push again.

Migration 002 auto-closes duplicate live applications for the same email address before adding a unique index that prevents new ones; review `/admin/inquiries` afterwards if you expect duplicates.

## Reviewing submissions

**Review is feedback, not a gate.** A learner's progress is recorded the moment they submit evidence, so the next mission opens immediately and a submission sitting in the queue never holds anyone up. Approving is encouragement and a record — it does not unlock anything.

`/admin/submissions` shows, for each submission: who sent it (name and email), which track and mission with its position in the sequence, how far that learner has got overall, their own 1-5 rating of the module, and the full thread of replies. Filter by state, search by learner, mission or track, ten to a page.

Three actions, all of which write a message to the thread and a notification the learner sees at next sign-in:

- **Approve** — marks it approved. With no note, the learner still gets a short congratulation.
- **Request changes** — marks it for another look. Write what to change.
- **Send message only** — a comment or a cheer that leaves the verdict alone.

Learners see the same thread under the mission and can reply, so a question does not need email. Their unread count sits in the bell in the portal header.

Rating, replies, and notifications need migration `006_submission_reviews.sql`. Until it runs, the queue falls back to its old shape and says so at the top.

## Admin access

Admins are added from **Admin → Admins** (`/admin/admins`): enter a name and email, and that person receives an invite email. They become an admin by signing in with Google on that address — Google is the verification, so there is no token to leak and nothing to run in the database. If they already have an account the role lands immediately; otherwise it is applied automatically at their first sign-in, even though they never applied as a learner.

Removing access is on the same page. Two moves are refused: removing yourself, and removing the last remaining admin.

A role change reaches an already-signed-in session at its next token refresh, within about an hour. Signing out and back in applies it at once.

Under the hood (migration `005_admin_invites.sql`): `public.admin_invites` holds the invites, and security definer functions — `invite_admin`, `claim_admin_invite`, `revoke_admin`, `list_admins` — are the only things that write `auth.users`. Each re-checks its caller, so admin promotion never needs the service-role key (the only thing that uses that key is the email outbox, and it never touches `auth.users`).

## Bootstrapping the first admin

Only needed once per database, before anyone can use the page above.

1. Set your own account as admin (replace the email):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where email = 'you@example.com';
```

2. Sign out and sign back in so the refreshed JWT contains the admin role. From then on, invite everyone else from **Admin → Admins**.

## Vercel variables

Set these for Production and Preview, then redeploy:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
NEXT_PUBLIC_SITE_URL=https://handsonacademy.org.ng
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<Cloudflare Turnstile site key>
TURNSTILE_SECRET_KEY=<Cloudflare Turnstile secret key>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<Google OAuth web client ID>
RESEND_API_KEY=<Resend API key>
EMAIL_FROM=HandsOn Academy <noreply@handsonacademy.org.ng>
EMAIL_REPLY_TO=hello@handsonacademy.org.ng
SUPABASE_SERVICE_ROLE_KEY=<Supabase service_role key, server-only>
CRON_SECRET=<any long random string>
```

Two of these are quiet failure modes worth checking twice. `EMAIL_FROM` must be an address on the Resend-verified domain, or every send is rejected and you will only see it in the function logs. `NEXT_PUBLIC_SITE_URL` builds every link inside every email, so if it is wrong the approval email points somewhere useless.

`SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API Keys) is used by exactly one thing, the email outbox, and must never be prefixed `NEXT_PUBLIC_`. Without it email still goes out, but directly and untracked: no daily-quota enforcement and nothing queued for the next day. `CRON_SECRET` is what Vercel presents when it runs the daily outbox cron; Vercel sets it as the `Authorization` header automatically once the variable exists.

**Applying sends no email to anyone, applicant or admin.** The approval and decline messages are the only email this system produces, holding spend to one per decided applicant. New applications arrive silently, so `/admin/inquiries` needs checking on a rhythm while a cohort is open — nothing will land in your inbox to prompt you.

Turnstile keys are required before enabling bot protection on public forms. Create a Cloudflare Turnstile widget restricted to `handsonacademy.org.ng` and provide its site key and secret key in Vercel. Never expose the secret key in client code. When `TURNSTILE_SECRET_KEY` is absent the bot check is skipped rather than failing closed, so `/api/inquiries` is an open insert until you set it.

## Email setup (Resend)

Transactional email uses [Resend](https://resend.com), whose free tier covers 3,000 emails per month, **100 per UTC day** (resets at 00:00 UTC, not a rolling window) and 25 API requests per second (raised from the default 10 on request; the app paces individual sends at 20 per second, `REQUEST_GAP_MS` in `lib/email/resend.ts`). Exceeding the daily cap returns `429 Too many requests` and the email is simply not sent, so the app enforces the limit itself — see "Sending limits and the outbox" below. If the community outgrows this, enable Resend's pay-as-you-go ($0.90 per extra 1,000) or move to a plan; the ceilings live in `lib/email/send.ts` (`DAILY_LIMIT`, `BULK_DAILY_CEILING`) and nothing else changes.

1. Create a Resend account and add `handsonacademy.org.ng` under Domains.
2. Add the SPF and DKIM DNS records Resend generates to your domain's DNS, and wait for the domain to show as verified. Mail sent from an unverified domain will be rejected or land in spam.
3. Create an API key with send permission and set `RESEND_API_KEY` in Vercel.
4. Set `EMAIL_FROM` to an address on the verified domain. `EMAIL_REPLY_TO` should be an inbox a human reads, since applicants will reply to these emails.
5. Consider adding a DMARC record (`_dmarc.handsonacademy.org.ng`) once SPF and DKIM pass, to protect deliverability.

Emails sent: approval carrying the portal sign-in link, and a decline notice listing the common reasons and inviting a reply. Nothing at all is sent when someone applies. Because the decline invites a reply, `EMAIL_REPLY_TO` must be an inbox a human actually reads. `community_inquiries.decision_email_sent_at` makes a repeated Approve click a no-op, and is stamped once the email is sent or safely queued, so a hard failure can be retried by clicking again. With `RESEND_API_KEY` unset, every send is skipped with a server log line instead of silently pretending to work.

### Sending limits and the outbox

Every email is recorded in `public.email_outbox` (migration 007) before it goes out, which is how the app knows how much of today's 100 is used. The rules:

- **Bulk mail stops at 90 a day.** Announcements and event updates queue one row per recipient, then send as many as fit under 90 in a single batch request (Resend's batch endpoint takes up to 100 emails per call, so the per-second request limit is never in play). The remaining 10 slots are kept for the emails a person is waiting on right then: event registration confirmations, application decisions, admin invites. Those may use the full 100.
- **Anything that does not fit is queued, not dropped.** The daily cron `/api/cron/email-outbox` (schedule in `vercel.json`, 00:15 UTC, just after the quota resets) sends the next 90 each day until the queue is empty. A 250-contact announcement therefore takes three days: 90, 90, 70. On the Vercel Hobby plan a daily cron may fire anywhere within the hour, so "00:15" means "sometime between 00:00 and 01:00 UTC".
- **The announcements page shows the state**: sent today, bulk slots left, queued, and failed. **Deliver queued now** runs the same drain as the cron by hand, still within the ceiling. The composer tells you before you press Send how many will go now and how many later.
- If a transactional email arrives when all 100 are used, the request still succeeds (the registration or decision is saved) and the email is queued with priority over bulk mail. The admin result line says so.
- A request rejected as a whole (one invalid address spoils a strict batch) is retried address by address so the bad one fails alone. Rate-limit and quota responses put rows back in the queue; after three such attempts a row is marked failed and counted on the page. Everything is idempotency-keyed, so a retry cannot send a duplicate.
- Two admins pressing Send at the same moment, or an admin racing the cron, cannot overrun the cap: `email_outbox_claim` counts and claims under a database lock.

To inspect the queue directly:

```sql
select status, count(*) from public.email_outbox group by status;
select to_email, subject, attempts, last_error from public.email_outbox where status = 'failed' order by created_at desc;
```

To give a failed row another chance: `update public.email_outbox set status = 'queued', attempts = 0, sent_day = null where id = '<id>';`.

## Google sign-in and consent screen branding

Sign-in uses Google Identity Services: the browser obtains a signed ID token from Google on our own origin and hands it to Supabase via `signInWithIdToken`. No redirect URI is involved, so the consent screen shows `handsonacademy.org.ng` and our verified branding rather than the Supabase project URL.

The older redirect flow (`signInWithOAuth` → `/auth/callback`) is still wired up behind a "classic sign-in" fallback button. Both paths share the same approval gate in `lib/auth/admit.ts`.

Required configuration:

- Google Cloud → Clients → HandsOn Academy Web: `https://handsonacademy.org.ng` and `http://localhost:3000` under **Authorized JavaScript origins**.
- Supabase → Authentication → Providers → Google: the web client ID in **Client IDs**, with **Skip nonce checks** left off. Sign-in sends a real nonce (`lib/auth/nonce.ts`); Google embeds the hashed value in the token and Supabase hashes the raw value to compare.
- Vercel: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` set to the same client ID.

### Completing branding verification

Google suppresses the app name and logo, showing the redirect URI's domain instead, until the OAuth client is brand-verified. Verification requires proving ownership of every authorized domain, and authorized domains are derived from redirect URIs — so while `https://<project>.supabase.co/auth/v1/callback` is registered, `supabase.co` is an authorized domain that we can never verify.

Once the token flow is confirmed working in production:

1. Google Cloud → Clients → HandsOn Academy Web: delete the `https://<project>.supabase.co/auth/v1/callback` redirect URI. Leave the JavaScript origins in place. **This retires the classic sign-in fallback**, so confirm the new flow first.
2. Google Cloud → Branding: check that authorized domains now list only `handsonacademy.org.ng`, then submit for verification. Search Console ownership of that domain must be held by the same Google account.
3. Allow up to a few hours for Google to propagate the change before judging the result.

Only non-sensitive scopes (`openid`, `email`, `profile`) are requested, so no third-party security assessment is required.

## Smoke test

1. Submit an application at `/apply` with a real address, both signed out and while signed in as a different account. Neither attempt should error, and the applicant should receive **no** email. Submitting the same address twice should give a friendly "we already have an application" message, not a server error.
2. Approve that application at `/admin/inquiries` with the admin account. Confirm the result line reports it was emailed and the approval email arrives with a working `/login` link.
3. Follow that link and sign in with Google using the approved address. Confirm the consent screen names HandsOn Academy rather than the Supabase URL, and that you reach `/dashboard`.
   Also sign in with an address that has no approved application and confirm you are turned away with `?error=approval_required`.
4. Choose either free track, open a mission, complete the checklist, and submit evidence.
5. Open `/admin/submissions` with the admin account and approve or request changes.
6. Confirm the dashboard mission count changes after completion.

Payments are intentionally not included. Both tracks and all seeded missions are free.

## Running the admin inbox

`/admin/inquiries` splits into three tabs — Learners, Mentors & speakers, Sponsors — each with search and a status filter. Speakers currently share the `mentor` kind; separating them is a database constraint change, not a UI one.

- **Approving a learner emails them.** That email carries the only sign-in link they will ever get, so approving without email configured leaves someone approved but uninformed. The result line says which happened.
- **Bulk decisions** apply to the selected rows, with one optional note across all of them. They are processed sequentially, not in parallel, because a burst of parallel approvals is the fastest way to hit Resend's rate limit. Maximum 100 per request. Decisions beyond today's email quota are still applied; their emails are queued and the result line says how many go out after the reset.
- **Export CSV** and **Copy emails** act on your selection, or on everything currently filtered if nothing is selected — so filtering to approved learners and copying their addresses needs no selecting.
- An **emailed** marker shows who has already been notified. Re-applying the same decision will not send a second copy; if a send failed, repeating the action retries it.

Approving someone who was approved before the email flow existed will send them a "You are in" email for the first time. To suppress that for existing learners, mark them as already notified:

```sql
update public.community_inquiries
set decision_email_sent_at = coalesce(status_updated_at, created_at)
where kind = 'learner' and status = 'approved' and decision_email_sent_at is null;
```

## Editing course content

**Not possible from the admin UI in v1.** `/admin/content` lists tracks and missions read-only. Learner-facing lesson bodies live in `lib/lesson-content.ts` and `lib/lesson-catalog.ts` and are pre-rendered at build time, so changing what a learner reads means editing TypeScript and redeploying. See [CONTENT_MODEL.md](./CONTENT_MODEL.md) for the shape of the v2 work.

## Go-live checklist

1. Confirm the **Database migrations** workflow has run green against production (Actions tab). **Migration 002 must be applied before deploying this version** — the admin decision path writes `status_updated_at`, and without that column every approval is rejected by Postgres. The request still returns 200, reporting `0 updated · N failed`, and nobody is emailed. On a first deploy, run the workflow manually before the app goes out.
2. Confirm all Vercel variables above are set for Production, `EMAIL_FROM` is on the Resend-verified domain, and the domain shows verified in Resend with SPF and DKIM passing. `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` must be present and migration 007 applied, or announcements go out untracked and nothing is queued for the next day; check the announcements page shows the usage panel rather than the "not being tracked" notice, and that the cron appears under the project's Settings → Cron Jobs after deploy.
3. Confirm the Google client lists both JavaScript origins, and that Supabase carries the client ID under Authentication → Providers → Google → Client IDs with **Skip nonce checks** off.
4. Deploy, then work through the smoke test above.
5. Only once sign-in is confirmed working in production, remove the Supabase callback URL from the Google client and re-submit branding for verification. This step retires the classic sign-in fallback and cannot be undone without re-adding the URL.
