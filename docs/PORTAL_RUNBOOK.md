# HandsOn Academy portal runbook

## Current hosting model

The frontend and API route handlers run together on Vercel. The learner browser calls `/api/progress` and `/api/submissions` on the same domain, and those handlers use Supabase Auth/Postgres. Render is not required for the current free-course portal. Add a Render service only if you later need a separate long-running API or worker.

## One-time Supabase setup

1. Run `supabase/migrations/001_learning_engine.sql`, then `supabase/migrations/002_application_emails.sql`, in the Supabase SQL Editor. Both are safe to rerun and neither deletes tables or course data. Migration 002 auto-closes duplicate live applications for the same email address before adding a unique index that prevents new ones; review `/admin/inquiries` afterwards if you expect duplicates.
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
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<Google OAuth web client ID>
RESEND_API_KEY=<Resend API key>
EMAIL_FROM=HandsOn Academy <noreply@handsonacademy.org.ng>
EMAIL_REPLY_TO=hello@handsonacademy.org.ng
```

Two of these are quiet failure modes worth checking twice. `EMAIL_FROM` must be an address on the Resend-verified domain, or every send is rejected and you will only see it in the function logs. `NEXT_PUBLIC_SITE_URL` builds every link inside every email, so if it is wrong the approval email points somewhere useless.

**Applying sends no email to anyone, applicant or admin.** The approval and decline messages are the only email this system produces, holding spend to one per decided applicant. New applications arrive silently, so `/admin/inquiries` needs checking on a rhythm while a cohort is open — nothing will land in your inbox to prompt you.

Turnstile keys are required before enabling bot protection on public forms. Create a Cloudflare Turnstile widget restricted to `handsonacademy.org.ng` and provide its site key and secret key in Vercel. Never expose the secret key in client code. When `TURNSTILE_SECRET_KEY` is absent the bot check is skipped rather than failing closed, so `/api/inquiries` is an open insert until you set it.

## Email setup (Resend)

Transactional email uses [Resend](https://resend.com), whose free tier covers 3,000 emails per month and 100 per day. That is comfortably above an early cohort; if a launch pushes past 100 emails in a day, Brevo's free tier allows 300 per day and only `lib/email/send.ts` would need to change.

1. Create a Resend account and add `handsonacademy.org.ng` under Domains.
2. Add the SPF and DKIM DNS records Resend generates to your domain's DNS, and wait for the domain to show as verified. Mail sent from an unverified domain will be rejected or land in spam.
3. Create an API key with send permission and set `RESEND_API_KEY` in Vercel.
4. Set `EMAIL_FROM` to an address on the verified domain. `EMAIL_REPLY_TO` should be an inbox a human reads, since applicants will reply to these emails.
5. Consider adding a DMARC record (`_dmarc.handsonacademy.org.ng`) once SPF and DKIM pass, to protect deliverability.

Emails sent: approval carrying the portal sign-in link, and a decline notice listing the common reasons and inviting a reply. Nothing at all is sent when someone applies. Because the decline invites a reply, `EMAIL_REPLY_TO` must be an inbox a human actually reads. `community_inquiries.decision_email_sent_at` makes a repeated Approve click a no-op, and is only stamped after a successful send, so a failed send can be retried by clicking again. With `RESEND_API_KEY` unset, every send is skipped with a server log line instead of silently pretending to work.

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
- **Bulk decisions** apply to the selected rows, with one optional note across all of them. They are processed sequentially, not in parallel, because a burst of parallel approvals is the fastest way to hit Resend's rate limit. Maximum 100 per request.
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

1. Run migrations `001` then `002` in the Supabase SQL Editor. **Migration 002 must be applied before deploying this version** — the admin decision path writes `status_updated_at`, and without that column every approval is rejected by Postgres. The request still returns 200, reporting `0 updated · N failed`, and nobody is emailed.
2. Confirm all Vercel variables above are set for Production, `EMAIL_FROM` is on the Resend-verified domain, and the domain shows verified in Resend with SPF and DKIM passing.
3. Confirm the Google client lists both JavaScript origins, and that Supabase carries the client ID under Authentication → Providers → Google → Client IDs with **Skip nonce checks** off.
4. Deploy, then work through the smoke test above.
5. Only once sign-in is confirmed working in production, remove the Supabase callback URL from the Google client and re-submit branding for verification. This step retires the classic sign-in fallback and cannot be undone without re-adding the URL.
