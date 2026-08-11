# Database

Supabase Postgres. Migrations live in `supabase/migrations/` and are written to be safely rerunnable — they drop and recreate policies rather than tables, and never delete data.

| Migration | What it does |
|---|---|
| `001_learning_engine.sql` | Tables, RLS policies, and the seed for both tracks and all 25 missions. |
| `002_application_emails.sql` | Email bookkeeping columns, lookup indexes, and one live learner application per email address. |

Run them in order in the Supabase SQL Editor.

## Tables

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` → `auth.users` | Written on sign-in by `lib/auth/admit.ts`. |
| `learning_tracks` | `slug` unique | Public read only — no write policies. |
| `missions` | `id` text, `track_slug` → tracks | Thin record; lesson bodies are not here. See [CONTENT_MODEL.md](./CONTENT_MODEL.md). |
| `mission_progress` | PK `(user_id, mission_id)` | `not_started` / `in_progress` / `completed`. |
| `submissions` | `user_id`, `mission_id` | Evidence 1–10,000 chars; `pending` / `approved` / `needs_changes`. |
| `announcements` | `published` | Modelled but has no editor and no learner-facing surface yet. |
| `community_inquiries` | `kind`, `email`, `status` | Applications and community inquiries share this table. |

## `community_inquiries`

`kind` is one of `learner`, `mentor`, `sponsor` — speakers currently share `mentor`. `status` is one of `new`, `approved`, `rejected`, `blocked`, `contacted`, `closed`.

Added by migration 002:

- `decision_email_sent_at` — stamped only after a decision email is delivered, so re-approving never double-sends but a failed send can be retried.
- `status_updated_at` — when an admin last changed the status.
- `community_inquiries_lookup_idx` on `(kind, lower(email), status)` — the sign-in gate's query.
- `community_inquiries_created_at_idx` — the admin inbox ordering.
- `community_inquiries_live_learner_idx` — **partial unique** on `lower(email)` where `kind = 'learner'` and status is `new`, `approved`, or `contacted`. One live application per address, while still allowing someone rejected for one cohort to apply to the next. The API translates the resulting `23505` into a friendly message.

## Row-level security

RLS is the real authorisation boundary; there is no service-role key in the application.

- **Own data** — learners read and write only their own profile, progress, and submissions.
- **Public read** — `learning_tracks` and `missions` are readable by anyone. **Neither has any write policy**, which v2 content management must add before an admin UI can save anything.
- **Admin** — reads and updates on submissions, inquiries, and all progress, gated on `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`.
- **Inquiries** — anyone may insert (`with check (true)`). Reads are restricted to admins, plus applicants reading their own learner row.

Because the insert policy is permissive but the select policies are not, a public insert must **not** chain `.select()`. That would emit `INSERT ... RETURNING`, which RLS checks against the SELECT policies, failing the whole statement.

## Granting admin

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where email = 'you@example.com';
```

The role is carried in the JWT, so the account must sign out and back in before it takes effect.
