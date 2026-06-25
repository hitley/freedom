# C4 · Data model & schema

> **C4 (code).** The persistence view of the model: the physical tables and how the
> per-context [models](./components/) map onto them. For the logical model of each
> context, see its [component page](./components/).

A map of every table, what hangs off what, and where each piece of data is read and
written. Source of truth is [`src/db/schema.ts`](../../src/db/schema.ts); migrations live
in [`drizzle/`](../../drizzle). This doc is the orientation layer on top of them.

> **Stack:** Neon Postgres + Drizzle ORM. Every query is parameterised through Drizzle
> (no string-built SQL). All app data is multi-tenant and authorization is checked
> server-side in the DAL ([`src/lib/server/`](../../src/lib/server)) — never trust a
> client-supplied id.

---

## The big picture

There are three groups of tables:

```
┌─────────────────────────── AUTH.JS (identity) ───────────────────────────┐
│  user ──┬── account            (OAuth links: Google)                      │
│         ├── session            (server-side, revocable sessions)          │
│         └── (verificationToken — unused with OAuth-only, kept for shape)  │
└──────────┬────────────────────────────────────────────────────────────────┘
           │ owns
           ▼
┌─────────────────────────── TENANCY ──────────────────────────────────────┐
│  instance   (a workspace: you, a family, someone you share with)          │
│   • ownerId → user.id                                                     │
└──────────┬────────────────────────────────────────────────────────────────┘
           │ every row of app data references instance_id
           ▼
┌─────────────────────────── APP DATA (per instance) ──────────────────────┐
│  TYPED COLUMNS          JSONB DOCUMENTS            MULTI-ROW QUEUE         │
│  ─────────────          ───────────────            ───────────────         │
│  financial_profile      vision_state              inbox_item              │
│   (1 row / instance)    buckets_state              (N rows / instance)     │
│                         investments_state                                 │
│                         spending_state                                    │
│                         (each 1 row / instance,                           │
│                          unique instance_id)                              │
└───────────────────────────────────────────────────────────────────────────┘
```

The key design decision: **most app state is stored as one JSONB document per
instance**, not normalised into relational tables. The data is a nested document the
app reads and writes whole, validated by a zod schema at the boundary. Two tables break
that mould — `financial_profile` (typed columns, because the engine reads individual
numbers) and `inbox_item` (one row per dropped artifact, because each has its own
lifecycle).

### Three storage shapes, and why

| Shape | Tables | Why this shape |
|-------|--------|----------------|
| **Typed columns** | `financial_profile` | The finance engine consumes individual scalars (`currentInvested`, `realReturnPct`…); typed columns make them queryable and defaultable. |
| **JSONB document** | `vision_state`, `buckets_state`, `investments_state`, `spending_state` | The app reads/writes the whole nested document; a zod schema already validates it. Normalising buckets/holdings/transactions into tables would buy nothing the app uses today. |
| **Multi-row queue** | `inbox_item` | Each dropped artifact has an independent `status` lifecycle and is processed asynchronously — it's a queue, not a document. |

---

## Auth.js tables

Standard `@auth/drizzle-adapter` shape. Identity lives entirely in our own database;
Google is just the sign-in method. Defined in
[`schema.ts`](../../src/db/schema.ts); wired in [`src/auth.ts`](../../src/auth.ts).

### `user`
The person. One row per signed-in identity.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text (PK) | UUID, app-generated |
| `name`, `email`, `image` | text | `email` unique + not null |
| `emailVerified` | timestamp | set by the adapter |

Sign-in is **allowlisted** — the `signIn` callback in `src/auth.ts` admits only emails
in `AUTH_ALLOWED_EMAILS` *before* any user row is created.

### `account`
OAuth provider links (refresh/access tokens, provider account id). Composite PK
`(provider, providerAccountId)`. `userId` → `user.id` (cascade delete).

### `session`
Server-side, revocable sessions (database session strategy). `sessionToken` PK,
`userId` → `user.id` (cascade), `expires`.

### `verificationToken`
Part of the adapter contract; unused with OAuth-only sign-in but kept for shape.

---

## Tenancy: `instance`

An **instance is a workspace** — yourself, a family, or someone you share with later.
Every piece of app data hangs off an instance, and every instance has an `ownerId`.
This is how data is segregated so the app can serve more than one user.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | `defaultRandom()` |
| `name` | text | e.g. "Personal" |
| `ownerId` | text → `user.id` | cascade delete |
| `createdAt` | timestamp | |

**Provisioning is lazy.** A user's default instance is created on their *first write*,
never on render:

- `getDefaultInstance()` — read-only, returns `null` if none yet (used by all `load*`).
- `getOrCreateDefaultInstance()` — write-path only, creates "Personal" on first save.
- `requireInstance(id)` — ownership choke-point when a client *does* name an instance.

All three live in [`src/lib/server/instance.ts`](../../src/lib/server/instance.ts), the
authorization choke-point. `requireUser()` resolves the signed-in user (or the dev-bypass
user locally). **Authorization today is owner-only** (`instance.ownerId`); true
multi-member workspace *sharing* is future work.

---

## App data — typed columns: `financial_profile`

The inputs the finance engine runs on. **One row per instance** (`instance_id` is
`unique`, so the save path upserts).

| Column | Type | Default |
|--------|------|---------|
| `instanceId` | uuid → `instance.id` (unique, cascade) | |
| `currentInvested` | numeric | 0 |
| `monthlyContribution` | numeric | 0 |
| `annualSpend` | numeric | 0 |
| `realReturnPct` | numeric | 5 |
| `withdrawalRatePct` | numeric | 4 |
| `ongoingAnnualIncome` | numeric | 0 |
| `currentAge` | integer | null |
| `updatedAt` | timestamp | now |

**Read/written by:** [`financial-profile.ts`](../../src/lib/server/financial-profile.ts)
(`loadFinancialProfile` / `saveFinancialProfile`), crossing the `financialInputsSchema`
zod boundary in and out.

**Used where:** seeds the **Trajectory** view's projection (`project(inputs)` in
`FreedomApp`). Note: `currentInvested` and `monthlyContribution` are still persisted but
are now **overridden at render** by figures derived from the investments domain (portfolio
value + contributions ÷ 12) — see the Reality section note in `CLAUDE.md`.

> ⚠️ **Security note:** monetary figures are stored as plain `numeric` for now.
> Field-level encryption of these is a planned hardening step before any real/shared
> data lands.

---

## App data — JSONB documents

Four tables, **identical shape**: `id`, `instance_id` (unique → `instance.id`, cascade),
`data jsonb`, `updatedAt`. The `data` column is untyped in the schema; the DAL parses it
through the domain's zod schema on **read and write**, so a malformed or stale row fails
loudly. Each has a matching DAL with a `load*` / `save*` pair that upserts on
`instance_id`.

| Table | DAL | zod boundary | Domain |
|-------|-----|--------------|--------|
| `vision_state` | [`vision.ts`](../../src/lib/server/vision.ts) | `freedomVisionSchema` | [`src/lib/vision`](../../src/lib/vision) |
| `buckets_state` | [`buckets.ts`](../../src/lib/server/buckets.ts) | `bucketsStateSchema` | [`src/lib/buckets`](../../src/lib/buckets) |
| `investments_state` | [`investments.ts`](../../src/lib/server/investments.ts) | `investmentsStateSchema` | [`src/lib/investments`](../../src/lib/investments) |
| `spending_state` | [`spending.ts`](../../src/lib/server/spending.ts) | `spendingStateSchema` | [`src/lib/spending`](../../src/lib/spending) |

### What's inside each `data` document

**`vision_state.data`** → `FreedomVision`
The captured goal: `headline`, `why`, `motivations[]`, `fireStyle`, `annualSpend`,
optional `targetAge`. Drives the Vision modal; its `annualSpend` seeds the engine's goal.

**`buckets_state.data`** → `BucketsState` `{ accounts[], buckets[] }`
- `Account` — a real place money sits (`kind`, `balance`).
- `Bucket` — a purpose envelope with `allocations[]` (slices of accounts) and
  `cashflows[]` (scheduled money in/out, with a `Recurrence`). Optional `target` /
  `targetDate`.
- Over-allocation is surfaced in the UI, not rejected at the schema.

**`investments_state.data`** → `InvestmentsState` `{ holdings[] }`
- `Holding` — valued `market` (`units × pricePerUnit`) or `balance` (direct value).
  Optional `contribution` (recurring), `drp` (dividend reinvestment), and `history[]`
  (manual `HoldingSnapshot`s for tracking past values).

**`spending_state.data`** → `SpendingState` `{ transactions[] }`
- `Transaction` — one observed movement: `amount` (always positive) + `direction`,
  `category`, and a `source` (`manual` or `import` carrying the originating
  `inboxItemId` for provenance). Imported rows reconcile into this same list.

---

## App data — multi-row queue: `inbox_item`

The durable queue at the head of the bookkeeper pipeline
(Capture → Extract → Propose → Reconcile). **Many rows per instance** (`instance_id` is
*not* unique here), each a dropped artifact with its own lifecycle.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `instanceId` | uuid → `instance.id` (cascade) | not unique |
| `source` | text | `csv` / `text` today; `pdf` / `image` / `email` reserved |
| `label` | text | filename or "Pasted text" |
| `raw` | text | the artifact inline (CSV/text); a blob ref for binaries later |
| `status` | text | lifecycle, default `pending` |
| `extracted` | jsonb (nullable) | candidate facts; null until processed |
| `error` | text (nullable) | failure detail when `failed` |
| `createdAt` / `processedAt` | timestamp | |

**Index:** `inbox_item_instance_status_idx` on `(instance_id, status)` — serves the two
hot queries: an instance's inbox list, and a processor draining `pending` items.

### Status lifecycle

```
pending ──Extract──▶ proposed ──Reconcile──▶ applied
   │                    │
   │                    └──(user drops it)──▶ dismissed
   └──(parse error)──▶ failed
```

`extracting` is the transient claimed state; `applied` / `dismissed` are terminal
(`TERMINAL_STATUSES`).

### What's inside `extracted`

When a CSV is processed, `extracted` holds a `ProposedTransactions` document:
`{ transactions[], duplicateCount, skipped, totalRows }` — the deduped drafts plus the
counts shown in the "N transactions ready to review" summary.

### Read/written by

[`inbox.ts`](../../src/lib/server/inbox.ts) is the exception in **shape** but not
discipline — a **multi-row** table, so it exposes `listInbox` / `addInboxItem` /
`getInboxItem` / `setInboxStatus` rather than a load/save pair. Every read/write still
resolves the instance from the session (`getInboxItem` re-checks ownership via
`requireInstance`; updates are scoped to the resolved instance in the `WHERE`).

Two orchestrators sit on top:
- [`extract.ts`](../../src/lib/server/extract.ts) (`processInboxItem`) — the **Extract**
  stage: read a `pending` CSV, parse + dedupe against spending, write `proposed` drafts.
  Same function a Vercel Cron runner will call.
- [`reconcile.ts`](../../src/lib/server/reconcile.ts) (`reconcileInboxItem`) — the **only**
  point that touches the live spending ledger, and only on approval: validate the
  approved subset belongs to the item, append to spending, flip to `applied`.

---

## How a request flows through the layers

```
page.tsx / actions.ts          (thin "use server" — no auth/validation logic here)
        │  delegates to
        ▼
src/lib/server/*.ts  (DAL)     ← requireUser() + zod validation + ownership scoping
        │  Drizzle (parameterised)
        ▼
Neon Postgres
```

- **Reads** happen server-side in `page.tsx` via `Promise.all` of the `load*` /
  `listInbox` fns, passed to `FreedomApp` as initial props.
- **Writes** go through thin `"use server"` actions in
  [`src/app/actions.ts`](../../src/app/actions.ts) that delegate to the DAL. Auth +
  validation live in the DAL, never the action.
- `inputs` / `buckets` / `investments` / `spending` save **debounced**; `vision` saves
  **explicitly** on flow completion; inbox capture/dismiss/process/reconcile go straight
  through their actions (with `revalidatePath`).

---

## Migrations

Generated and applied with `drizzle-kit`:

```bash
npx drizzle-kit generate   # create a migration from schema.ts changes
npx drizzle-kit migrate    # apply migrations to DATABASE_URL
```

Migrations are committed under [`drizzle/`](../../drizzle) with a `meta/` snapshot. Change
`schema.ts`, generate, review the SQL, then apply.

---

## Security recap

- **No secrets or financial data in git.** `.env.local` is gitignored.
- **Validate at the boundary with zod** — every JSONB document and typed-column write
  crosses its domain schema on the way in *and* out.
- **Parameterised queries only** (Drizzle) — never string-built SQL.
- **Authorization centralised in the DAL** — resolve the instance from the session,
  never from a client-supplied id, so there's no IDOR surface.
- **Planned hardening before real/shared data:** field-level encryption of monetary
  figures at rest, security headers / CSP, audit trail.
