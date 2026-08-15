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
