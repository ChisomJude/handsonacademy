# HandsOn Academy

Project-based technology learning: a public marketing site, a gated learning portal with tracks, missions and evidence submissions, and an admin surface for admissions and review.

**Status: v1, going live.** Content management is deferred to v2 — see [docs/ROADMAP.md](./docs/ROADMAP.md).

## Run locally

Requires Node.js 24+.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Copy `.env.example` to `.env.local` and fill in what you need. The app degrades honestly when a service is unconfigured: without Supabase keys the dashboard is a setup preview and never fakes authentication, and without a Resend key emails are logged rather than silently dropped.

## Quality checks

`npm run typecheck`, `npm run lint`, and `npm run build`.

## Docker

`docker compose up --build`, then open `http://localhost:3000`.

## Configuration and deployment

Copy `.env.example` to `.env.local`, and set the same variables in Vercel for Preview and Production. [docs/PORTAL_RUNBOOK.md](./docs/PORTAL_RUNBOOK.md) is the operational source of truth: Supabase migrations, granting admin, Resend domain verification, Google consent-screen branding, the go-live checklist, and the smoke test.

Two things bite quietly if wrong: `EMAIL_FROM` must be on the Resend-verified domain, and `NEXT_PUBLIC_SITE_URL` builds every link inside every email. Email is held to Resend's free-tier limit (100 a day): bulk announcements send up to 90 in one batch and queue the rest for a daily cron (`vercel.json`), which needs `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` set.

## Applicant journey

1. A visitor applies at `/apply`. One live application per email address; reapplying after a rejection is allowed.
2. An admin approves or declines at `/admin/inquiries`, individually or in bulk.
3. Approval emails the applicant a link to `/login`. **Nothing else tells them they were accepted**, so this email is load-bearing.
4. Sign-in admits a Google account only if its email has an approved learner application. Admins bypass the check.

## Authentication

Google Identity Services runs on our own origin: the browser gets a signed ID token and hands it to Supabase, with no redirect through the Supabase project URL. That is what lets the Google consent screen carry our own domain and branding. The older redirect flow stays behind a fallback button until the Supabase callback URL is removed from the Google client.

## Architecture

App Router pages are server-rendered; interactive pieces are small client islands. Row-level security is the real authorisation boundary — there is no service-role key in the application. See [docs](./docs) for product, architecture, database, design, roadmap, and content-model detail.

## Known limitations

- **Course content is not editable from the admin UI.** Lesson bodies are static TypeScript, pre-rendered at build time; changing them requires a deploy. This is the main v2 item.
- **Turnstile fails open.** With `TURNSTILE_SECRET_KEY` unset the bot check is skipped entirely and `/api/inquiries` has no rate limiting of its own. Set it in production.
- Announcements are sent by email from the admin console, with no learner-facing feed in the portal.
- Learner notifications cover submission review only; nothing else writes to the bell yet.
- Speakers share the `mentor` inquiry kind.
- Payments are not implemented; every track and mission is free.
- No automated test suite. CI covers database migrations only (`.github/workflows/database-migrations.yml`); the app itself deploys straight from Vercel's Git integration.
