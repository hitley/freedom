# Freedom

An app to **define and track three dimensions of personal freedom** (Financial, Time, Health).
For each you project your goals and *why* they matter, capture your current state, then track the
trajectory and ETA to the goal. The Financial Domain is built today; Time and Health are slots in
the same framework.

- **Architecture, conventions, and taxonomy:** [`CLAUDE.md`](CLAUDE.md) (the root shell; deep notes
  live in per-folder `CLAUDE.md` files next to the code).
- **What's next and why:** [`ROADMAP.md`](ROADMAP.md).
- **Living docs** (behaviour + C4 architecture) are served at `/docs` and generated from the code
  and the `features/**` specs.

## Getting started (fresh clone)

1. `npm install`
2. `cp .env.example .env.local` and fill it in:
   - **Database** — for local dev the quickest path is `DATABASE_DRIVER=pglite` (in-process
     Postgres, no server, persists to `./.pglite`); leave it unset to use a real Neon connection
     string in `DATABASE_URL` (neon.tech or Vercel Marketplace).
   - `AUTH_SECRET` — generate with `npx auth secret`. (Or set `AUTH_DEV_BYPASS=true` to skip Google
     sign-in entirely for local dev.)
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — a Google Cloud OAuth client (Web). Add redirect URI
     `http://localhost:3000/api/auth/callback/google`.
3. Create the tables: **`npm run db:local`** (PGlite) or `npx drizzle-kit migrate` (Neon / any
   wire-protocol Postgres).
4. `npm run dev` — open http://localhost:3000.

The app boots without the DB/auth env set, but any page that touches sign-in or persistence will
error until `.env.local` is populated and migrations are run.

## Commands

See the **Commands** section of [`CLAUDE.md`](CLAUDE.md) for the full list (tests, BDD specs, docs
generation, migrations).

## Deploying

**Deploying to Vercel?** See [`DEPLOYMENT.md`](DEPLOYMENT.md) — the production runbook (Neon prod
DB + migrations, Vercel env vars, Google OAuth redirect, and the build-time `DATABASE_URL` gotcha).
