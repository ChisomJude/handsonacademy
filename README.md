# Handson Academy
Public Phase 0 + 1 foundation for a project-based technology learning platform.

## Run locally
Requires Node.js 24+.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Copy `.env.example` to `.env.local` when environment configuration is needed. Phase 1 has no required runtime variables.

## Quality checks
`npm run typecheck`, `npm run lint`, and `npm run build`.

## Docker
`docker compose up --build`, then open `http://localhost:3000`.

## Architecture
App Router pages are server-rendered. Interactive components are deliberately small client islands. Track data is currently static in `lib/tracks.ts`, ready to be replaced by a PostgreSQL repository in Phase 2. See [docs](./docs) for product, architecture, database, design, roadmap, and content-model decisions.

## Phase 2/3 configuration
Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key from Supabase Project Settings → API Keys. Add the same public variables to Vercel for Preview and Production. Google OAuth must be enabled in Supabase Authentication → Providers, with the callback URL set to `https://your-domain.com/auth/callback` (and the local equivalent for development). The dashboard is protected when these variables are present; without them it remains a safe setup preview and never fakes authentication.

## Current limitations
Waitlist, application, sponsor, and mentor forms validate in the browser but do not persist data. Track progress is currently a prepared dashboard surface with static launch-track content; persistence, missions, submissions, and evidence arrive with the Learning Engine.
