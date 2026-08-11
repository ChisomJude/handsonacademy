# Architecture

Next.js App Router on Vercel, with Supabase providing authentication and Postgres. Route handlers run on the same domain as the pages, so the browser never calls Supabase directly for anything privileged. Pages are server components by default; interactive pieces are deliberately small client islands.

## Layout

| Area | Routes |
|---|---|
| Marketing | `/`, `/about`, `/tracks`, `/tracks/[slug]`, `/community`, `/sponsor`, `/mentor`, `/apply`, `/privacy`, `/terms` |
| Auth | `/login`, `/auth/callback`, `/api/auth/session` |
| Portal | `/dashboard`, `/dashboard/tracks`, `/dashboard/tracks/[slug]`, `/dashboard/missions`, `/dashboard/missions/[id]` |
| Admin | `/admin`, `/admin/inquiries`, `/admin/submissions`, `/admin/content` |
| API | `/api/inquiries`, `/api/progress`, `/api/submissions`, `/api/admin/*` |

## Authentication

Sign-in uses **Google Identity Services on our own origin**: the browser obtains a signed ID token from Google and passes it to Supabase via `signInWithIdToken`. No redirect URI is involved, so Google's consent screen names `handsonacademy.org.ng` rather than the Supabase project URL — which is also what makes brand verification possible, since Google requires ownership of every authorized domain.

A nonce is used properly. Google embeds the **hashed** nonce in the token; Supabase hashes the **raw** value to compare. `lib/auth/nonce.ts` produces both and documents the direction, because reversing them fails with an opaque error.

The older `signInWithOAuth` redirect flow remains behind a fallback button until the Supabase callback URL is removed from the Google client.

## The admission gate

`lib/auth/admit.ts` is the single source of truth: it admits admins unconditionally, and otherwise requires an approved learner application matching the account's email. Both sign-in paths call it, so they cannot drift apart. `proxy.ts` independently re-checks on every `/dashboard` request and enforces sequential mission unlocking.

The check deliberately takes the most recent approved row rather than expecting exactly one. `maybeSingle()` raises `PGRST116` and nulls the result on multiple matches, which would lock out an approved learner who had reapplied after a rejection.

## Email

`lib/email/send.ts` posts to the Resend REST API — no SDK, keeping the dependency list small. It never throws: a failed send must not fail the database write that triggered it. With no `RESEND_API_KEY` it logs what it would have sent rather than pretending delivery worked, so preview environments stay honest.

`decision_email_sent_at` is stamped only after a successful send, making a repeated Approve click a no-op while still allowing a failed send to be retried.

## Content

Learner-facing lesson bodies are **static TypeScript modules** (`lib/lesson-content.ts`, `lib/lesson-catalog.ts`), pre-rendered at build time. The `missions` table holds a parallel, thinner record used for progress and submission foreign keys and the read-only admin content listing. Changing what a learner reads currently requires a deploy. See [CONTENT_MODEL.md](./CONTENT_MODEL.md).

## Data access and RLS

Every query runs through the caller's own Supabase client, so Postgres row-level security is the real authorisation boundary — route handlers add checks but do not replace it. There is no service-role key in the application.

One consequence worth knowing: chaining `.select()` onto an insert makes PostgREST emit `INSERT ... RETURNING`, and RLS applies the **SELECT** policies to returned rows. Public inserts into `community_inquiries` therefore must not request the inserted row back, or they fail with "new row violates row-level security policy" despite a permissive insert policy.
