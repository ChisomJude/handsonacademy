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

## Current limitations
Waitlist and application forms validate in the browser but do not persist data. Login is an honest Phase 2 placeholder; it never simulates authentication.
