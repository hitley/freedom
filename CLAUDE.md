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

> **Future work / ideas live in [`ROADMAP.md`](ROADMAP.md).** This file documents
> what exists; the roadmap documents what's next and why. Check it when picking up
> fresh, and keep it current as things ship.

## Architecture

- **Framework**: Next.js 16 (App Router) + React 19 + Tailwind 4, `src/`. Deploys
  to **Vercel**. Unlike a static site, this is a real full-stack app with auth and
  a database — private per-user data.
- **Auth**: Auth.js v5 (`next-auth`, self-hosted). Google is the only sign-in
  method; identity is stored in **our own** Postgres via `@auth/drizzle-adapter`.
  Database session strategy (revocable). Config in `src/auth.ts`; route handler at
  `src/app/api/auth/[...nextauth]/route.ts`. Sign-in is **allowlisted** — the
  `signIn` callback admits only emails in `AUTH_ALLOWED_EMAILS` (comma-separated),
  rejecting everyone else *before* any user/session row is created (empty list falls
  open, for dev only). This keeps the app private; add family/partner emails here.
  Authorization today is **owner-only** (`instances.ownerId`); true multi-member
  workspace *sharing* is future work (see `ROADMAP.md`).
  - **Local-dev auth bypass** (`src/lib/server/dev-auth.ts`): set `AUTH_DEV_BYPASS=true`
    in `.env.local` to skip Google sign-in and run as a fixed local user (`Local Dev`,
    provisioned in the DB so instances FK correctly). Real auth is **on by default in
    every environment**; the bypass is opt-in *and* hard-gated to non-production
    (`NODE_ENV === "production"` always refuses it, flag or no flag) — it can never
    disable auth on a deployed instance. `requireUser` short-circuits to the dev user,
    `page.tsx` / `signin` skip the gate, and the header shows an "Auth off · local"
    badge in place of sign-out.
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
- **Investments domain** (`src/lib/investments/`): pure data + helpers for the
  freedom-generating assets the user holds — super, shares, ETFs. Each `Holding` is
  valued one of two ways: **`market`** (`units × pricePerUnit` — shares/ETFs, so worth
  moves with the market) or **`balance`** (a directly-entered value — super, cash). It
  optionally carries a recurring **`Contribution`** (reusing the buckets recurrence
  engine) and a **`Drp`** (dividend reinvestment — an annual yield reinvested into the
  holding, compounding value instead of paying cash). `holdingValue` / `holdingView` /
  `summarise` give the today snapshot (total, by-kind split, annual contributions +
  dividends), and `simulate(state, from, to)` projects every holding forward on a
  monthly grid (compounding growth + reinvested DRP, adding contributions on their real
  scheduled dates) into an `InvestmentsTimeline`. A holding can also carry recorded
  **`history`** (manual `HoldingSnapshot`s — value + money paid in on a date, e.g.
  yearly super statements); `holdingHistory` derives each period's **growth** by
  stripping out contributions (`value − prevValue − contributed`), the figure the detail
  view charts and tables. `projectHolding(start, from, to, monthlyContribution,
  annualGrowthPct)` is a single-holding what-if projection with the two levers passed
  explicitly (so the detail view can drive live sliders), with `monthlyContribution` /
  `assumedAnnualGrowthPct` helpers seeding those levers from the holding.
  **Prices are manual for now** — a live
  feed slots in via the `PriceProvider` seam (`manualPriceProvider` is the default,
  returning no quotes so holdings value at their stored price; pass a `quotes` map keyed
  by ticker to override). Investments are deliberately **independent of the projection
  engine** for now (feeding totals into `currentInvested` is a future step).
  `investmentsStateSchema` is the zod boundary (ready for persistence; not stored yet).
- **Spending domain** (`src/lib/spending/`): pure data + helpers for the user's
  *observed* outgoings and income — the counterpart to buckets' *intended* `Cashflow`s.
  Each `Transaction` is a single statement line or manual entry: a positive `amount` plus
  a `direction` (`in`/`out`), a `category`, and a `source` (`manual` or an `import`
  carrying the originating `inboxItemId` for provenance). "Spend" deliberately excludes
  own-account `transfer`s (and income), so totals reflect real outgoings: `isSpend` /
  `isIncome` gate the rollups, `summarise` gives totals + `spendByCategory` +
  `spendByMonth`, and **`spendWindow` / `annualisedSpend`** scale the observed window to a
  full year — the data-backed figure intended to feed the vision's target spend. Imports
  dedupe at the Propose stage via `dedupeKey` (`date|signedAmount|normalisedDescription`,
  id/provenance excluded so the same real transaction from two statements keys equal) and
  the `dedupe(existing, candidates)` splitter. `spendingStateSchema` is the zod boundary.
  This is the **first piece of the async ingestion inbox / bookkeeper pipeline** (design
  in `design-notes/001-ingestion-inbox-bookkeeper.md`). The domain is **persisted and
  surfaced** via `spending/SpendingPanel` (annualised-spend headline vs the vision's target
  spend, a by-category breakdown, and the transaction list) with `spending/TransactionEditor`
  as the add/edit modal. It also owns the **deterministic CSV parser** (`csv.ts`):
  `parseStatementCsv(raw, mappingOverride?)` locates columns by fuzzy header matching
  (single signed `amount`, or separate debit/credit) and tolerantly parses UK date/amount
  formats into `DraftTransaction`s — pure and unit-tested (`csv.test.ts`); `ColumnMapping`
  is returned so a per-bank mapping step can override detection later. `proposedTransactions
  Schema` is the shape the Extract stage stores on an inbox item (deduped drafts + counts).
- **Inbox domain** (`src/lib/inbox/`): the durable **queue at the head of the bookkeeper
  pipeline** (Capture → Extract → Propose → Reconcile). Unlike the other domains (one jsonb
  document per instance), this is a **real table, one row per dropped artifact**
  (`inbox_item`), each with an independent `status` lifecycle (`pending` → `extracting` →
  `proposed` → `applied`, or `failed`/`dismissed`) processed asynchronously. An `InboxItem`
  holds the artifact `raw` (CSV/text inline now; a blob reference for PDFs/images later — so
  it's typed as an opaque string from day one), a `source`, and `extracted` candidate facts
  (null until processed). Pure helpers (`isActive`, `needsReview`, `sortByNewest`,
  `countByStatus`) + the `newInboxItemSchema` zod boundary (source allowlist of `csv`/`text`
  + a ~1MB size cap). **Capture and Extract are wired**: drop a statement CSV (upload or
  paste) or a free-text note → `pending`; then **Extract** (`src/lib/server/extract.ts`,
  `processInboxItem`) parses the CSV via `parseStatementCsv`, assigns ids + `import`
  provenance, **dedupes** against the spending ledger, and moves the item to `proposed`
  with the fresh drafts on `extracted`. It's synchronous behind a manual "Process" button
  for now — the same function will be the body of a Vercel Cron `/api/inbox/process`
  runner. **Reconcile** (`src/lib/server/reconcile.ts`, `reconcileInboxItem`) is the only
  point that touches the live ledger, and only on approval: it validates the user-approved
  subset really came from this item (categories may be edited, rows dropped — nothing
  foreign smuggled in), dedupes again, appends to spending, and flips the item to
  `applied`. **The full pipeline now runs end-to-end** (drop → process → review → applied →
  in spending); free-text/PDF Extract awaits the LLM stage.
- **Access layer** (`src/lib/server/`): the server-only data-access layer (DAL).
  `instance.ts` is the authorization choke-point — `requireUser` (cached `auth()`),
  `getDefaultInstance` (read-only; `null` if none), `getOrCreateDefaultInstance`
  (write-path only — lazily provisions the workspace on first save, so renders never
  mutate), and `requireInstance(id)` (ownership check for client-named instances).
  `financial-profile.ts` was the first domain wired through it: `loadFinancialProfile`
  / `saveFinancialProfile`, crossing the `financialInputsSchema` zod boundary in *and*
  out and upserting on the unique `instanceId`. The `vision`, `buckets`,
  `investments`, and `spending` domains follow the same shape (`vision.ts` /
  `buckets.ts` / `investments.ts` / `spending.ts`) but store a **single jsonb document**
  per instance (validated through each domain's zod schema on read/write) instead of
  typed columns — the data is a nested document the app reads/writes whole. `inbox.ts` is
  the exception in **shape** but not in discipline: it's a **multi-row** table, so it
  exposes `listInbox` / `addInboxItem` / `getInboxItem` / `setInboxStatus` rather than a
  load/save pair, but every read/write still resolves the instance from the session
  (`getInboxItem` re-checks ownership via `requireInstance`, and updates are scoped to the
  resolved instance in the `WHERE`). `extract.ts` (`processInboxItem`) orchestrates the
  Extract stage on top of these — read a `pending` CSV item, parse, dedupe against the
  loaded spending, write `proposed` drafts back — and is the same function a cron runner
  will call. `reconcile.ts` (`reconcileInboxItem`) closes the loop: validate the approved
  subset belongs to the item, append to spending, mark `applied`. Thin `"use server"`
  actions in `src/app/actions.ts` delegate here; auth + validation live in the DAL, never
  the action.
- **UI flow** (`src/components/`): `FreedomApp` orchestrates the financial
  dimension. **All domains are persisted per-instance** — `page.tsx` loads `inputs` /
  `vision` / `buckets` / `investments` / `spending` plus the `inbox` list server-side
  (`Promise.all` of the `load*`/`listInbox` DAL fns) and passes them as initial props;
  `FreedomApp` saves changes through the matching `save*Action` props. The inbox differs:
  it's a live per-row queue, so capture/dismiss go straight through `addInboxItemAction` /
  `dismissInboxItemAction` (which `revalidatePath` the route), updating the local list from
  the result rather than debounced-saving a document; a pending CSV item also has a
  **Process** action (`processInboxItemAction`) that runs Extract, and a proposal's
  **Reconcile** (`reconcileInboxItemAction`) returns *both* the applied item and the new
  spending state so `FreedomApp` updates the inbox and the ledger in one go. `inputs`,
  `buckets`, `investments`,
  and `spending` save **debounced** (via the `useDebouncedSave` hook, which skips the
  first run so seeding doesn't write back); the `vision` is saved **explicitly** when the
  capture flow completes. Each `load*` returns `null` for a fresh instance, so the UI
  falls back to `DEFAULT_INPUTS` / onboarding / the illustrative seeds. The home page is
  **auth-gated** (`page.tsx` redirects to `/signin` without a session;
  `src/app/signin/page.tsx` is the Google sign-in; a sign-out form sits in the header).
  The **vision is a dismissible modal, not page furniture** (it was eating the top of
  the page): `FreedomApp` holds a `visionOpen` flag that **opens on every first load**
  and is reachable thereafter via a **Vision** option that sits as the first item in the
  view toggle (it triggers the modal rather than switching the inline view, so it never
  takes an active state). The modal uses the same overlay chrome as the editors (click-off
  anywhere to dismiss); it shows the read-only `VisionPanel` when a vision exists (its
  Edit button re-enters the flow), or the guided `onboarding/VisionOnboarding` flow
  directly when none is set yet. Completing the flow saves and closes it. The
  **Vision | Trajectory | Buckets | Investments | Spending |
  Inbox** toggle drives: `FinancialDashboard` (controlled `inputs`/`proj`; the captured goal seeds its
  annual spend), `buckets/BucketsPanel`, `investments/InvestmentsPanel` (portfolio value +
  by-kind breakdown + 1-year look-ahead, with `investments/HoldingEditor` as the
  add/edit modal — which also captures the per-holding `history`). Clicking a holding
  tile **maximises** it into `investments/HoldingDetail`: one timeline showing the
  recorded past (solid line, left of a "today" divider) flowing into a dashed
  projection (right of it), driven by live what-if sliders (monthly contribution +
  estimated growth %, seeded from the holding but non-destructive), with a year-by-year
  growth breakdown below; "Minimise" returns to the overview. This **maximise-to-detail
  interaction is a reusable shell** (`src/components/detail/`): `DetailShell` (the
  glyph/title/subtitle header + Edit/Minimise chrome), `ProjectionChart` (the generic
  past+projected SVG — today divider, gridlines, hover scrubber, optional horizontal
  reference line, with a domain-supplied `tooltipLines(series, idx)` callback) plus its
  `HorizonSelector`, and `primitives` (`Stat`, `Slider`, `compactMoney`). `HoldingDetail`
  is built on it, and so is the buckets equivalent. The buckets view leads
  with `buckets/BucketsTimeline` (a
  hand-built SVG look-ahead chart of projected balances, with a horizon selector and
  hover scrubber), an accounts strip with an "as of" selector that projects each
  account forward, and bucket cards; clicking a card **maximises** it into
  `buckets/BucketDetail` (same shell) — a forward-only projection of that single bucket's
  balance (via `simulate`), with the goal drawn as a reference line, the projected hit
  date in the headline, and a live "extra monthly contribution" what-if lever (a
  synthetic `in` cashflow) that shows how much sooner the goal lands. `BucketEditor` (incl.
  per-bucket scheduled payments) / `AccountsEditor` are modals. Buckets are independent of
  the projection engine for now — feeding bucket totals into the engine is a future step. The
  **Spending** view (`spending/SpendingPanel`) leads with the **annualised-spend**
  headline compared against the vision's target spend, a by-category breakdown bar, and
  the transaction list (newest-first; click a row to edit); `spending/TransactionEditor`
  is the add/edit modal. Manual entry today — imported statement rows will reconcile into
  the same list once the ingestion inbox lands. The **Inbox** view (`inbox/InboxPanel`) is
  the head of that pipeline: a capture card (source toggle, CSV upload **or** paste, or a
  free-text note) that queues a `pending` item, above the queue list with per-item status
  chips, a **Process** button on pending CSV items, and dismiss. Processing a CSV runs the
  Extract stage and shows an inline "N transactions ready to review" summary (deduped count
  + spend total) on the now-`proposed` item; a **Review** button opens `inbox/ReviewModal`,
  where each draft can be re-categorised or dropped before approving the rest into the
  spending ledger (`onReconcile` → the item goes `applied` and the new transactions appear
  in the Spending view, tagged "imported").

## Data model & multi-tenancy

- **Instance** = a workspace (yourself; a family; someone you share with later).
  Every piece of user data hangs off an instance; every instance has an `ownerId`.
  This is how data is segregated so the app can serve others, not just one user.
- **Authorization is always checked server-side** — never trust the client with
  another instance's data. Confirm the signed-in user owns/belongs to the instance
  on every read and write. This is centralised in the **DAL** (`src/lib/server/`,
  see Architecture) — resolve the instance from the session, never from a
  client-supplied id, so there's no IDOR surface.
- `financialProfiles` holds the engine inputs for an instance as typed columns; the
  captured **vision**, **buckets**, **investments**, and **spending** state are each a
  per-instance **jsonb document** (`vision_state` / `buckets_state` / `investments_state`
  / `spending_state`). All five are **wired end-to-end** (one row per instance —
  `instanceId` is unique — loaded server-side on render and saved via their
  `save*Action`s, each validated through its zod schema). The **`inbox_item`** table is
  the different shape: **many rows per instance** (not unique), each a dropped artifact
  with its own `status` lifecycle and a `(instance_id, status)` index for the list/drain
  queries — owner-scoped through the same DAL discipline. The user's default instance is
  lazily created on first save.

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
- **Market prices** follow the same pattern: the investments domain reads quotes
  through the `PriceProvider` seam (`src/lib/investments`). The default
  `manualPriceProvider` returns nothing, so holdings value at their stored price; a
  live feed (broker/market-data API) implements the same interface later with no
  change to the domain or UI value math.

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
- `npm test` — Vitest: pure-`lib` unit tests **plus** the Gherkin behavioural specs
  under `features/` (`@amiceli/vitest-cucumber`); `npm run test:watch` to watch.
- `npm run test:bdd` — just the `features/` behavioural specs.
- `npm run test:e2e` — Playwright journey(s) in `e2e/` (needs a `DATABASE_URL` in
  `.env.local`; launches the dev server on port 3100 with `AUTH_DEV_BYPASS=true`). First
  run needs browsers: `npx playwright install chromium`.
- `npm run docs:generate` — regenerate the VitePress feature docs from `features/**`.
  `npm run docs:dev` to preview, `npm run docs:build` to build into `public/docs`
  (served at `/docs`). `npm run docs:check` fails if the committed docs are stale;
  `npm run docs:affected -- --run` runs the specs a changed path maps to.
- `npm run lint` — Next.js lint. Type-check: `npx tsc --noEmit`.
- `npx drizzle-kit generate` — create a migration from schema changes.
- `npx drizzle-kit migrate` — apply migrations to `DATABASE_URL`.
- `npx auth secret` — generate `AUTH_SECRET`.

## Patterns (follow these — they save re-deriving from source)

- **A finance domain = four files in the same shape** (see `buckets`, `investments`):
  `types.ts` (plain data, no imports beyond sibling types), `index.ts` (pure helpers +
  the `zod` boundary schema + `export *` of the types), then UI as a `*Panel`
  (summary + list, owns no state — parent passes `state` + `onChange`) and an
  `*Editor` **modal** (assembles one item, returns it via `onSave`). Reuse the
  recurrence engine (`occurrences`, `addMonths`, `startOfDay`, `toISO`) from
  `@/lib/buckets` rather than reinventing scheduling.
- **A maximised detail view = the shared shell** (`src/components/detail/`). A panel
  holds a `detailId` state; when set it renders `<DetailShell>` (header + Minimise)
  wrapping headline `Stat`s, a `<ProjectionChart>` (pass `actual`/`projected` point
  arrays, a `tooltipLines` callback, an optional `reference` line, a `HorizonSelector`
  as `headerRight`), and `Slider` what-if levers. Cards become clickable
  (`role="button"` + `onClick` setting `detailId`); the card's Edit button
  `stopPropagation`s. Don't rebuild the SVG chart, scrubber, or `Stat`/`Slider`
  per domain — `HoldingDetail` and `BucketDetail` are the worked examples.
- **Test the pure domain, not the UI.** Each `src/lib/<domain>` gets an
  `index.test.ts` next to it (Vitest, Node env, `@` alias works). The domains are
  designed I/O-free precisely so this is cheap — add cases when you add helpers.
- **Behaviour & intent = a Gherkin spec, in two tiers** (design in
  `design-notes/002-bdd-testing-and-living-docs.md`; these `.feature` files are also the
  intended seed for generated VitePress `/docs`). Tier 1 lives in `features/<capability>/`:
  a `.feature` file (user-facing prose + Given/When/Then) + a `*.steps.ts` binding it via
  `@amiceli/vitest-cucumber`, run by Vitest. Two shapes — **pure domain** (steps call the
  helpers directly, no infra — `features/spending/`) and **server pipeline** (drives the
  real `extract.ts`/`reconcile.ts` with the DAL swapped for `features/support/dal-fake.ts`
  via `vi.mock`; `server-only` is aliased to a stub in `vitest.config.ts`). Tier 2 is
  Playwright (`e2e/`) for the few full-stack journeys only — rationed, not a regression
  net. Step text uses cucumber expressions (`{string}`, `{number}`); `And` steps must be
  registered with `And` (matching is type-sensitive). Prefer adding a scenario to an
  existing feature over a new unit test when you're pinning *intended behaviour*.
- **The `.feature` files are also the docs.** They generate the VitePress site served at
  `/docs` (`scripts/feature-docs.mjs` parses them with the *same* `loadFeature`; output is
  the committed `docs/features/**` Markdown, built into `public/docs`). So: write the
  `Feature:` block as user-facing prose, and tag each feature with `@source:<path>` lines
  naming the application paths it validates. A **PostToolUse hook**
  (`scripts/claude-feature-hook.mjs`, `.claude/settings.json`) auto-regenerates the docs
  and runs the affected specs when you edit a `.feature` or a tagged `src/` path — if you
  change a `.feature`, commit the regenerated `docs/features/**` alongside it
  (`npm run docs:check` enforces this). Add a `@source` tag when a new spec covers a path,
  or the hook will flag that path as uncovered.
- **Tailwind exposes only the base palette** (`emerald`, `gold`, `muted`, `surface`,
  `surface-2`, `border`, `foreground` — see `@theme inline` in `globals.css`). There
  is **no** `-dim` utility; shade with opacity (`bg-emerald/50`), not `bg-emerald-dim`.
- **Shared form primitives** live in `src/components/forms/primitives.tsx`
  (`Field`, `MoneyInput`, `NumberInput`, `PercentInput`, `Select`, `DateInput`) —
  import them into editor modals rather than re-defining; they're pure presentational
  field controls. Domain-specific sub-forms (toggles, cashflow/history rows) stay in
  their editor. A handful of bespoke inline `<input type="date">` fields (full-width,
  `rounded-xl`) remain inline by design where the compact `DateInput` doesn't fit.
- **Previewing locally:** the app's dev server runs on **port 3100** (the launch
  config `freedom-dev` in `.claude/launch.json` pins it, so it never collides with
  other repos on 3000). The Investments/Buckets views only mount **after** the vision
  onboarding completes — drive that flow first when verifying in a browser.

## Conventions

- Pure engine logic in `src/lib/` (no React, no DB). UI in `src/app` + components.
- Commit/push only when asked.
- **Update the docs as part of every feature.** After building or changing
  functionality, update this `CLAUDE.md` (and any other affected docs) in the same
  pass so the architecture, data model, and "what's built vs planned" notes stay
  accurate. This keeps context clears cheap — the next session can pick up from the
  docs alone.
