@AGENTS.md

# Freedom

An app to **define and track three dimensions of personal freedom**. For each
dimension you (1) project your goals and *why* they matter, (2) capture your
current state, then (3) track the trajectory and ETA to the goal. Visual and
interactive by design — no boring spreadsheets.

**Dimension 1 (in progress): Financial freedom.** First **capture the vision &
goal** — what freedom looks like, *why* it matters, and the target spend (step 1).
Then work out your "magic number" (what it takes to be financially free), capture
current net worth, and see the projection and your **freedom date**. Dimensions 2
and 3 (e.g. Time, Health) are slots in the same framework, not yet built.

## Architecture

- **Framework**: Next.js 16 (App Router) + React 19 + Tailwind 4, `src/`. Deploys
  to **Vercel**. Unlike a static site, this is a real full-stack app with auth and
  a database — private per-user data.
- **Auth**: Auth.js v5 (`next-auth`, self-hosted). Google is the only sign-in
  method; identity is stored in **our own** Postgres via `@auth/drizzle-adapter`.
  Database session strategy (revocable). Config in `src/auth.ts`; route handler at
  `src/app/api/auth/[...nextauth]/route.ts`.
- **Database**: Neon Postgres + Drizzle ORM (`src/db/`). Type-safe, parameterised
  queries. Schema in `src/db/schema.ts`; migrations via `drizzle-kit` → `drizzle/`.
- **Engine** (`src/lib/finance/`): pure, dependency-light, framework-agnostic math
  (magic number, coast number, month-by-month projection). No I/O — unit-testable.
  Validation via zod at the trust boundary (`financialInputsSchema`).
- **Vision domain** (`src/lib/vision/`): pure data for the vision & goal capture
  phase — the `FreedomVision` type (headline, why, motivations, FIRE style, target
  spend/age), motivation + FIRE-style metadata, and the `freedomVisionSchema` zod
  boundary (ready for persistence; not stored yet).
- **Buckets domain** (`src/lib/buckets/`): pure data + helpers for a virtual layer
  of *purpose* over real accounts. You record each `Account`'s balance, then carve
  `Allocation` slices into purpose `Bucket`s; a bucket can draw from several
  accounts. Today-snapshot helpers (`bucketView`, `accountView`, `summarise`) derive
  each bucket's balance / % funded and — the key insight — each account's
  **unallocated remainder** (money with no purpose, e.g. spare cash in a mortgage
  offset). Buckets also carry **`Cashflow`s** (scheduled money in/out): `schedule.ts`
  is a pure recurrence engine (`occurrences` for once / weekly-on-weekday /
  monthly-on-day, with intervals + end dates, plus date utils), and `simulate(state,
  from, to)` replays every cashflow chronologically into a **`Timeline`** of bucket &
  account balances over time. A dated **`out` + `drain`** flow models a spend event
  (e.g. a holiday) that empties the bucket on its date; `projectedTargetDate` reads
  the first date a bucket hits its target. `bucketsStateSchema` is the zod boundary
  (ready for persistence; not stored yet). Over-allocation is surfaced in the UI, not
  rejected at the schema.
- **UI flow** (`src/components/`): `FreedomApp` orchestrates the financial
  dimension — it owns the `vision`, engine `inputs`, and `buckets` (client-side
  state for now, **not yet persisted**) and shows the guided
  `onboarding/VisionOnboarding` flow first, then `VisionPanel` (editable, re-opens
  the flow) above a **Trajectory | Buckets** toggle: `FinancialDashboard`
  (controlled `inputs`/`proj`; the captured goal seeds its annual spend) and
  `buckets/BucketsPanel`. The buckets view leads with `buckets/BucketsTimeline` (a
  hand-built SVG look-ahead chart of projected balances, with a horizon selector and
  hover scrubber), an accounts strip with an "as of" selector that projects each
  account forward, and bucket cards; `BucketEditor` (incl. per-bucket scheduled
  payments) / `AccountsEditor` are modals. Buckets are independent of the projection
  engine for now — feeding bucket totals into the engine is a future step.

## Data model & multi-tenancy

- **Instance** = a workspace (yourself; a family; someone you share with later).
  Every piece of user data hangs off an instance; every instance has an `ownerId`.
  This is how data is segregated so the app can serve others, not just one user.
- **Authorization is always checked server-side** — never trust the client with
  another instance's data. Confirm the signed-in user owns/belongs to the instance
  on every read and write.
- `financialProfiles` holds the engine inputs for an instance.
- The captured **vision** and the **buckets** state are **not persisted yet** —
  they live in client state (seeded with illustrative starter data in `FreedomApp`).
  The next step for each is a per-instance table fed by its zod schema
  (`freedomVisionSchema` / `bucketsStateSchema`), read/written server-side with the
  same ownership checks.

## Security (utmost priority)

- No secrets or personal/financial data in git. `.env.local` is gitignored;
  `.env.example` documents the keys. Production secrets live in Vercel env / OIDC.
- Validate all input at the boundary with zod. Use Drizzle (parameterised) — never
  string-built SQL.
- **Planned hardening before any real/shared data**: field-level encryption of
  monetary figures at rest; security headers / CSP; audit trail. (Currently amounts
  are stored as plain numeric — see `financialProfiles` note.)
- Sign-in offloads password/MFA risk to Google; we only store the identity link.

## Ingestion (manual now, automated later)

- Start with manual entry + CSV/statement upload. Keep ingestion behind a clean
  interface so Open Banking / Plaid automation can slot in later without touching
  the engine. (No live financial-system integrations yet.)

## Getting started (fresh clone)

1. `npm install`
2. `cp .env.example .env.local` and fill it in:
   - `DATABASE_URL` — a Neon Postgres connection string (neon.tech or Vercel
     Marketplace).
   - `AUTH_SECRET` — generate with `npx auth secret`.
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — a Google Cloud OAuth client (Web).
     Add redirect URI `http://localhost:3000/api/auth/callback/google`.
3. `npx drizzle-kit migrate` — create the tables in your database.
4. `npm run dev` — open http://localhost:3000.

The app boots without the DB/auth env set, but any page that touches sign-in or
persistence will error until `.env.local` is populated and migrations are run.

## Commands

- `npm run dev` — local app at http://localhost:3000.
- `npm run lint` — Next.js lint. Type-check: `npx tsc --noEmit`.
- `npx drizzle-kit generate` — create a migration from schema changes.
- `npx drizzle-kit migrate` — apply migrations to `DATABASE_URL`.
- `npx auth secret` — generate `AUTH_SECRET`.

## Conventions

- Pure engine logic in `src/lib/` (no React, no DB). UI in `src/app` + components.
- Commit/push only when asked.
- **Update the docs as part of every feature.** After building or changing
  functionality, update this `CLAUDE.md` (and any other affected docs) in the same
  pass so the architecture, data model, and "what's built vs planned" notes stay
  accurate. This keeps context clears cheap — the next session can pick up from the
  docs alone.
