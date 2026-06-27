# Roadmap & ideas

Future work and ideas for **Freedom**, so a fresh session (or a fresh head) can
pick up without re-deriving intent. This is the *aspirational* companion to
`CLAUDE.md` — `CLAUDE.md` describes what exists and how it's built; this file
describes what we want next and why. Keep it loose; promote an item into a real
plan when you start it, and delete it here once it ships (and update `CLAUDE.md`).

## Near-term (Dimension 1: Financial freedom)

- **Investments overview, richer.** The per-holding detail view landed; the main
  Investments page is still just a portfolio total + by-kind split + 1-yr look-ahead.
  Wanted:
  - A **whole-portfolio past + projected timeline** (like `HoldingDetail`'s chart but
    summed across holdings, reusing recorded `history` + `simulate`).
  - **Sort / group** holdings (by kind, value, growth).
  - An **income view** — contributions in vs dividends (cash vs reinvested) per year.
- **Recurring expenses, the monthly budget & bill reconciliation — building.** Make the
  Spending tab more than a daily ledger: model the *expected* side (monthly direct debits,
  quarterly/annual ad-hoc bills like car servicing) as a new `RecurringExpense` in the
  `spending` domain — a bottom-up budget that normalises to "per month" and feeds the
  vision target more stably than today's noisy window extrapolation. Then **reconcile**
  real bills (dropped into the inbox) against what was expected: suggest-and-confirm
  matching, variance, due/overdue, and estimate refinement over time. **Step 1 (the pure
  model) has landed:** `RecurringExpense` + the budget helpers (`monthlyEquivalent` …
  `budgetSummary`), `dueOccurrences` / `reconcileWindow`, the `transaction.recurring`
  confirmed-link, zod boundary, and tests/BDD spec. **Persistence (step 2) came for free**
  — `recurring` rides inside the existing `spending_state` jsonb document the DAL already
  round-trips, no migration. **The budget UI (step 3) has landed too:** a **Planned**
  section in the Spending tab (monthly-budget headline vs the observed annualised figure,
  by-category bar, commitment list, "Coming up" due list) + a `RecurringExpenseEditor` with
  a friendly cadence picker. **Reconciliation (step 4) has landed too:** `suggestMatches`
  proposes the actuals that could settle each occurrence, and a `ReconcileModal` lets you
  confirm a match (stamping `transaction.recurring`, with variance chips) or unlink.
  **Next:** bill ingestion (step 5) — single-artifact LLM Extract + blob storage — then the
  optional estimate-refinement (step 6) and feeding `annualBudget` into the vision/engine. The "drop bills into the inbox" half is
  001's deferred LLM Extract for non-CSV sources (single artifact → single transaction) +
  blob storage. Full design, data model, and build order in
  `design-notes/003-recurring-expenses-and-budget-reconciliation.md`.
- **Feed investments into the projection engine.** Today the investments domain is
  deliberately independent of `src/lib/finance`. Wire portfolio totals into the
  engine's `currentInvested` so the freedom-date trajectory reflects real holdings.
  (Same open question for feeding bucket totals in.)
- **Persistence — ✅ done (financial dimension).** All four domains (engine inputs,
  vision, buckets, investments) now round-trip through Postgres, read/written
  server-side with owner-scoped checks and zod validation. The plan and build log are
  retained below for reference.

  ### Persistence plan (decided 2026-06-19)

  **Database: stay on Neon Postgres + Drizzle.** Already chosen, modelled, and coded
  against (`src/db`, `@auth/drizzle-adapter`). Free tier (0.5 GB, scale-to-zero, DB
  branching) covers a personal/family app for years. No reason to switch.

  **Encryption: rely on Neon's at-rest encryption (AES-256) + TLS in transit** for
  now — values stay queryable/aggregatable in SQL. App-level field encryption of
  monetary figures is deliberately *deferred* (see Security section); revisit as a
  dedicated pass before sharing data with anyone outside the owner.

  **Storage shape: one JSONB document per domain, keyed by `instanceId`** — not
  normalised relational tables. Each of `vision` / `buckets` / `investments` is a
  nested document the app reads and writes *whole*, and each already has a zod schema
  that is its validation boundary. So: `vision_state` / `buckets_state` /
  `investments_state` tables, each `{ instanceId (unique FK), data jsonb, updatedAt }`,
  with the existing zod schema validating on the way in *and* out (parse on read so a
  bad/stale row fails loudly). `financialProfiles` stays as typed columns (engine
  benefits; already built). Rationale: minimal schema churn, matches how the UI uses
  the data, and single-row upserts sidestep the **`neon-http` driver's lack of
  multi-statement transactions** (`src/db/index.ts`). Normalising into relational
  tables is a later move *only if* cross-instance SQL queries are ever needed.

  **Access layer: server-side only, ownership-checked.** No data-access code exists yet
  (`use server` grep is empty). Introduce `src/lib/server/` (or `src/db/queries/`):
  - `requireUser()` — wraps `auth()`, throws if unauthenticated.
  - `getOrCreateDefaultInstance(userId)` — **instance bootstrap is missing today**;
    nothing creates a workspace on first sign-in. Lazily create one default instance
    per user (owner = user) on first authenticated load.
  - `requireInstance(instanceId, userId)` — single choke-point that confirms
    `instance.ownerId === userId` before *every* read/write. Never trust a client-sent
    instanceId without this.
  - Per-domain `load<Domain>(instanceId)` / `save<Domain>(instanceId, state)` server
    actions that re-validate with the domain's zod schema and call `requireInstance`.

  **UI wiring:** turn `FreedomApp`'s ancestor into a server component that loads the
  four pieces of state for the default instance and passes them as initial props;
  `FreedomApp` stays a client component but its `onChange` handlers call the save
  server actions (debounced) instead of only mutating local state. Keep the
  illustrative starter data only as the seed for a brand-new empty instance.

  **Build order (vertical slice first):**
  1. ✅ `npx drizzle-kit generate` → first migration for the *existing* schema (auth +
     `instances` + `financialProfiles`, `instanceId` made unique), **applied to Neon**
     via `npx drizzle-kit migrate`. `drizzle.config.ts` now `loadEnvFile(".env.local")`
     so drizzle-kit sees `DATABASE_URL`.
  2. ✅ DAL in `src/lib/server/`: `requireUser`, `getDefaultInstance` (read-only),
     `getOrCreateDefaultInstance` (write-path), `requireInstance`.
  3. ✅ `financialProfiles` wired end-to-end (`loadFinancialProfile` on render,
     `saveFinancialProfileAction` debounced from `FreedomApp`) + `/signin` page and
     auth gating, since the app had no way to sign in before.
  4. ✅ Added the three JSONB tables (`vision_state` / `buckets_state` /
     `investments_state`, `instanceId` unique + `data jsonb`) — migration
     `drizzle/0001_*.sql`, applied to Neon.
  5. ✅ Wired `vision` / `buckets` / `investments` through DAL + actions, loaded in
     `page.tsx` and saved from `FreedomApp` (buckets/investments debounced via
     `useDebouncedSave`; vision saved on capture completion).
  6. ✅ `CLAUDE.md` updated (all four domains now persisted).

  **Persistence is now complete for the financial dimension.** All four domains
  round-trip through Postgres with the same auth-gated, zod-validated, owner-scoped
  pattern.

  **DB is live; sign-in not yet exercised.** Steps 1–3 are written, type-check/lint/test
  clean, and the schema is migrated into Neon. Sign-in still needs a Google OAuth client
  (`AUTH_GOOGLE_ID` / `_SECRET` in `.env.local`) before the round-trip can be verified in
  the browser.

## Auth & sharing

- **Decided (2026-06-21):** Google-only sign-in; **allowlist** via `AUTH_ALLOWED_EMAILS`
  (the `signIn` callback rejects non-listed emails before any row is created); intended
  users are *me + family/partner*.
- **Workspace sharing (the family bit) — future.** Today authorization is **owner-only**
  (`instances.ownerId`, checked in `src/lib/server/instance.ts`). To let a partner open
  the *same* workspace, add an **`instance_members`** table (`instanceId`, `userId`,
  `role`) and change the DAL's check from "is owner" to "is a member", plus an
  invite/grant flow. The allowlist already lets each family member *in* (each gets their
  own instance); this adds genuine shared access on top. Don't build until shared access
  is actually wanted.

## Security (must land before any real or shared data)

- **Field-level encryption** of monetary figures at rest (amounts are currently plain
  numeric).
- **Security headers / CSP.**
- **Audit trail** for reads/writes of instance data.

## Ingestion (manual now → automated)

- **Async inbox & bookkeeper pipeline — building (designed 2026-06-21).** Drop financial
  artifacts (CSV statements, bills, notes) into an inbox/queue processed async into the
  state model via a four-stage pipeline (Capture → Extract → Propose → Reconcile), with
  user approval before anything touches live numbers. Decided: Vercel Cron runner,
  propose-then-approve, **bank CSV first** (deterministic, AI-free spine), a new `inbox`
  table + new `spending` domain whose `annualisedSpend` feeds the vision's target spend.
  **The deterministic pipeline now runs end-to-end:** the `spending` domain (persisted +
  Spending UI), inbox **Capture** (`inbox_item` table, DAL, Inbox tab — drop CSV/text →
  `pending`), **Extract** (`parseStatementCsv` → dedupe → `proposed`, behind a manual
  "Process" button), and **Reconcile** (the `ReviewModal` — re-categorise/drop drafts,
  approve into the ledger → `applied`, tagged "imported"). **Next:** a Vercel Cron
  `/api/inbox/process` runner wrapping the existing `processInboxItem` (so processing is
  automatic, not manual); the LLM Extract for bills/photos/free text; and the deferred
  bits — transaction↔cashflow matching, per-bank CSV column mapping, blob storage for
  PDFs/images. Full design, forks, and build order in
  `design-notes/001-ingestion-inbox-bookkeeper.md` (local; see `design-notes/README.md`).
- **CSV / statement upload** behind the existing clean ingestion interface.
- **Open Banking / Plaid** automation later, slotting in without touching the engine.
- **Live market prices** via the `PriceProvider` seam (broker / market-data API) —
  the default `manualPriceProvider` returns nothing today, so holdings value at their
  stored manual price.

## Later / bigger bets

- **Dimensions 2 & 3** (e.g. Time, Health) — slots in the same
  vision → current-state → trajectory framework, not yet built.

## Tidy-ups (do when nearby)

- **Shared form primitives — ✅ done.** Extracted to
  `src/components/forms/primitives.tsx` (`Field`, `MoneyInput`, `NumberInput`,
  `PercentInput`, `Select`, `DateInput`); the bucket/investments/spending editors now
  import them instead of each carrying a copy.
