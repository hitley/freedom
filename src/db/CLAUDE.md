# Database — `src/db/`

Neon Postgres + Drizzle ORM. Type-safe, parameterised queries. Schema in `src/db/schema.ts`;
migrations via `drizzle-kit` → `drizzle/`.

## Driver selection (`src/db/index.ts`)

Exposes a single `db` but picks the driver at boot by `DATABASE_DRIVER`:
- the default **Neon** HTTP driver (`neon-http`, prod + shared), or
- **PGlite** (`DATABASE_DRIVER=pglite`) for local dev — an in-process WASM Postgres persisted to
  `./.pglite` (`PGLITE_DATA_DIR`), no server/Docker, so dev data never touches the shared Neon DB.

Both drivers are dynamically imported so PGlite's WASM stays out of the prod bundle (also marked
`serverExternalPackages` in `next.config.ts`). PGlite can't be reached by `drizzle-kit migrate`
(no wire server) — apply migrations with **`npm run db:local`** (`scripts/migrate-local.mjs`, the
PGlite migrator over the committed `drizzle/` SQL).

## Local data profiles (real vs demo vs test)

Which dataset you're on is *only* a matter of **which folder PGlite opens** (`PGLITE_DATA_DIR`) —
never a code branch — so there's no conditional logic to get wrong. Three profiles, all driven by
npm scripts that set the env inline:

| Profile | Command | Data dir | Purpose |
|---------|---------|----------|---------|
| **real** | `npm run dev:real` | `~/.freedom/real.pglite` — **outside this repo** | your actual private data |
| **demo** | `npm run dev:demo` | `./.pglite-demo` (gitignored) | fabricated data for demos/screenshots |
| **test** | `npm test` / `npm run test:e2e` | ephemeral | already fake, unchanged |

- **The real profile lives outside the working tree on purpose.** Gitignore stops accidental
  *commits*; living at `~/.freedom` means no `git add -A`, `git clean`, stray `rm` in the repo, or
  "upload this folder" can ever reach your real numbers. First run: `npm run db:real` once to apply
  migrations there, then `npm run dev:real`.
- **The demo profile is disposable and reproducible.** `npm run seed:demo` migrates `./.pglite-demo`
  and rebuilds it from **`scripts/seed-demo.mjs`** — a committed, 100%-fabricated household ("Demo
  Household"). Safe to commit precisely because it's invented. The seed script **refuses to run
  unless `PGLITE_DATA_DIR` is set**, so it can never wipe the default or real db.
- **Every local profile sets `FREEDOM_PROFILE` and is labelled**, which lights up the
  `ProfileBanner` (`src/components/ProfileBanner.tsx`) at the top of every page: a **sky "DEV DATA"**
  bar under `dev` (`npm run dev`, the default `./.pglite` scratch db), an **amber "DEMO DATA"** bar
  under `demo`, a **red "REAL DATA"** bar under `real`. So the *unmarked* case is only production —
  a local instance is never an unlabelled data surface. **Ports are pinned in the scripts** (`dev`
  → 3000, `dev:demo` → 3101, `dev:real` → 3102) so real never lands on the default port; and a
  **boot guard** (`src/instrumentation.ts`, Next's `register`) **refuses to start `real` on port
  3000** — belt-and-braces against real financial data on the port opened by habit. (Production
  renders no bar and the guard is a no-op there.)
- Both dev profiles set `AUTH_DEV_BYPASS=true` and run as the fixed dev user
  (`src/lib/server/dev-auth.ts`); the seed writes that user's workspace so `dev:demo` reads it.

## Schema shape (multi-tenant)

- `financialProfiles` holds the engine inputs for an instance as **typed columns**.
- The captured **vision** / **buckets** / **investments** / **spending** state are each a
  per-instance **jsonb document** (`vision_state` / `buckets_state` / `investments_state` /
  `spending_state`), one row per instance (`instanceId` unique), validated through each
  Component's zod schema on read/write by the DAL.
- The **`inbox_item`** table is the different shape: **many rows per instance** (not unique), each
  a dropped artifact with its own `status` lifecycle and a `(instance_id, status)` index for the
  list/drain queries.
- These all belong to the **Financial Domain**; a `domain` discriminator column is the future seam
  when the Time / Health Domains land — not built yet.

Authorization/tenancy discipline lives in the DAL (`src/lib/server/CLAUDE.md`); the full
persistence view is `docs/architecture/data-model.md`.
