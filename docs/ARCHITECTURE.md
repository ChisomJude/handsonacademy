# Architecture
Next.js App Router renders public pages on the server by default. Interactive forms and navigation are isolated client components. Track data currently lives in `lib/tracks.ts`; Phase 2 should move it behind a repository interface backed by PostgreSQL. Future route groups should separate `(marketing)`, `(auth)`, `(hub)`, and `(admin)`.

No form data is persisted in Phase 1. Waitlist and application UI expose the intended fields and explicitly disclose this state.
