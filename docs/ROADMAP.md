# Roadmap

## v1 — shipped

- **Phase 0** — product, architecture, database, content, and design documentation.
- **Phase 1** — public marketing site, responsive layout, SEO, Docker.
- **Phase 2** — Google authentication, persisted applications and inquiries, Vercel deploy.
- **Phase 3** — Learning Hub, tracks, and mission progress.
- **Phase 4** — learning engine: missions, checklists, knowledge gates, evidence submissions.
- **Phase 5** — admin: overview, submission review, and the community inquiry inbox.
- **Applicant lifecycle** — apply, admin decision, approval email carrying the portal sign-in link, and a sign-in gate that admits only approved learners.
- **Own-domain Google sign-in** — the ID token flow runs on `handsonacademy.org.ng` rather than redirecting through the Supabase project URL, so the consent screen can carry our branding.
- **Admin inbox** — table view split by learner / mentor and speaker / sponsor, with search, status filters, bulk decisions, CSV export, and email copy.

## v2 — next

**Content management.** Admins should create and edit tracks and missions and have those changes appear for learners without a deploy. This is the largest single gap and is not a matter of adding forms. See [CONTENT_MODEL.md](./CONTENT_MODEL.md) for why: learner-facing lesson bodies live in TypeScript modules and are pre-rendered at build time, so the work is schema extension, content migration, a rendering change, and admin write policies before any CRUD UI is useful.

Also queued for v2:

- Announcements are modelled in the database and surfaced on the admin overview, but have no editor and no learner-facing display.
- Turnstile fails open: when `TURNSTILE_SECRET_KEY` is unset the bot check is skipped entirely, and `/api/inquiries` has no rate limiting of its own.
- No automated test suite and no CI.
- A `speaker` inquiry kind. Speakers currently share the `mentor` kind, which is a database constraint rather than a UI limitation.

## Later

- **Phase 6** — payments. Deliberately absent; every track and mission is free.
- **Phase 7** — caching, security hardening, monitoring, analytics, CI/CD, backups.
