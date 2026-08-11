# Handson Academy
Project-based technology learning platform: a public marketing site, a gated learning portal with tracks, missions and evidence submissions, and an admin review surface.

## Run locally
Requires Node.js 24+.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Copy `.env.example` to `.env.local` and fill in what you need. The app degrades honestly when a service is unconfigured: without Supabase keys the dashboard is a setup preview and never fakes authentication, and without a Resend key emails are logged instead of sent.

## Quality checks
`npm run typecheck`, `npm run lint`, and `npm run build`.

## Docker
`docker compose up --build`, then open `http://localhost:3000`.

## Configuration
Copy `.env.example` to `.env.local`, and set the same variables in Vercel for Preview and Production. See [docs/PORTAL_RUNBOOK.md](./docs/PORTAL_RUNBOOK.md) for the full setup, including the Supabase migrations, granting yourself the admin role, and verifying the email sending domain.

Supabase needs Google enabled under Authentication → Providers, with the web client ID listed under **Client IDs**. Sign-in uses Google Identity Services on our own origin rather than a redirect through Supabase, so the Google consent screen shows our domain and branding instead of the Supabase project URL. The older redirect flow remains available behind a fallback button until the Supabase callback URL is removed from the Google client — see the runbook.

## Applicant journey
1. A visitor applies at `/apply`. The row lands in `community_inquiries`, they receive a confirmation email, and the admin inbox is notified.
2. An admin approves or rejects at `/admin/inquiries`.
3. On approval the applicant is emailed a link to `/login`. Nothing else tells them they were accepted, so this email is load-bearing.
4. `/auth/callback` admits Google sign-ins whose email has an approved learner application, and turns everyone else away with `?error=approval_required`.

## Architecture
App Router pages are server-rendered; interactive components are deliberately small client islands. Tracks and missions live in Supabase (seeded by `supabase/migrations/001_learning_engine.sql`), with static fallbacks in `lib/tracks.ts`. See [docs](./docs) for product, architecture, database, design, roadmap, and content-model decisions.

## Current limitations
Payments are not implemented and both tracks are free. Public form protection depends on Cloudflare Turnstile: when `TURNSTILE_SECRET_KEY` is unset the bot check is skipped entirely, so set it in production. There is no automated test suite or CI yet.
