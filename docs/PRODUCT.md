# Product

HandsOn Academy is project-based technology learning. Learners choose a Learning Track, work through Milestones and Missions on their own machine, and submit evidence of what they built. A reviewer reads every submission.

## Who uses it

- **Applicants** apply through the public site. Access is not self-service: an admin reviews each application.
- **Approved learners** sign in with Google and reach the portal. Missions unlock in sequence — a mission is gated until the previous one in its track is complete.
- **Admins** review applications, approve or decline them, and review evidence submissions.
- **Sponsors, mentors and speakers** reach us through the community forms and land in the same admin inbox, tracked separately from learner applications.

## The admission loop

This is the spine of the product, and every part of it is deliberate:

1. Someone applies at `/apply`. One live application per email address is allowed; reapplying after a rejection is permitted.
2. An admin approves or declines in `/admin/inquiries`, individually or in bulk.
3. Approval sends an email carrying the portal sign-in link. **Nothing else tells an applicant they were accepted**, which makes this email load-bearing rather than a courtesy.
4. Sign-in admits a Google account only if its email address has an approved learner application. Admins bypass this check.

## Deliberate exclusions

- **Payments.** Both tracks and all missions are free. There is no billing code.
- **Self-service signup.** Portal access always passes through a human decision.
- **Applicant confirmation email.** Off by default to conserve email quota; the approval email is the one that matters.

## Current shape

Two live tracks — DevOps Beginner and Cloud Native Beginner — carrying 25 missions between them. Nine further tracks are listed publicly as unavailable placeholders.
