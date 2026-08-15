@AGENTS.md

# Freedom

An app to **define and track three dimensions of personal freedom**. For each
dimension you (1) project your goals and *why* they matter, (2) capture your
current state, then (3) track the trajectory and ETA to the goal. Visual and
interactive by design — no boring spreadsheets.

**Domain 1 (in progress): Financial freedom.** First **capture the vision &
goal** — what freedom looks like, *why* it matters, and the target spend (step 1).
Then work out your "magic number" (what it takes to be financially free), capture
current net worth, and see the projection and your **freedom date**. The Time and
Health Domains are slots in the same framework, not yet built.

> **This file is the shell.** It holds the universal context — taxonomy, the
> architecture map, data model, security, commands, conventions — plus a **navigation
> index** to the per-folder `CLAUDE.md` files. Deep, folder-specific notes live next to
> the code and **load lazily** when you work there (see [Where the detailed notes
> live](#where-the-detailed-notes-live)). Don't `@import` those files here — that would
> reload them every session and defeat the split.

> **Future work / ideas live in [`ROADMAP.md`](ROADMAP.md).** This file documents
> what exists; the roadmap documents what's next and why. Check it when picking up
> fresh, and keep it current as things ship.

## Taxonomy (the words this app uses — keep them straight)

Three nested altitudes, mapped onto the [C4 model](https://c4model.com). **Use these
consistently throughout code, tests, and docs:**

| Altitude | Term | Is | Examples |
|----------|------|----|----------|
| **C2 · Container** | **Domain** | a dimension of personal freedom | Financial (built), Time, Health |
| **C3 · Component** | **Component** — in code/React: **View** | a module within a Domain (one `src/lib/<x>` + its UI) | Vision, Trajectory, Investments, Buckets, Spending, Inbox |
| **C4 · Code** | **Element** | a UI/code building block of a Component | a `*Panel`, a chart/timeline widget, a `*Editor`/`*Modal`, plus the `types`/`index`/server files |

- **"Dimension"** = the outward/marketing synonym for **Domain** (e.g. the "Three dimensions of
  mastery" tagline). Architecture and code say **Domain**.
- **Component** (architecture) ≡ **View** (`.tsx`/React code — the `FinancialView` type). We say
  "View" in React code to avoid colliding with "React component"; "Component" everywhere else.
- An **Element** *is* a React component, but we call it an Element when talking architecture.

## Architecture (overview)

Next.js 16 (App Router) + React 19 + Tailwind 4 in `src/`, deployed to **Vercel** — a real
full-stack app with auth and a database (private per-user data), not a static site.

- **Auth**: Auth.js v5 (`next-auth`, self-hosted). Google is the only sign-in method; identity is
  stored in **our own** Postgres via `@auth/drizzle-adapter` (database session strategy,
  revocable). Config in `src/auth.ts`; route handler at `src/app/api/auth/[...nextauth]/route.ts`.
  Sign-in is **allowlisted** — the `signIn` callback admits only emails in `AUTH_ALLOWED_EMAILS`
  (comma-separated), rejecting everyone else *before* any user/session row is created (empty list
  falls open, for dev only). Authorization today is **owner-only** (`instances.ownerId`); true
  multi-member workspace *sharing* is future work (see `ROADMAP.md`).
  - **Local-dev auth bypass** (`src/lib/server/dev-auth.ts`): `AUTH_DEV_BYPASS=true` in
    `.env.local` skips Google sign-in and runs as a fixed local user. Real auth is **on by default
    in every environment**; the bypass is opt-in *and* hard-gated to non-production
    (`NODE_ENV === "production"` always refuses it) — it can never disable auth on a deployed
    instance.
- **Database**: Neon Postgres + Drizzle ORM (`src/db/`), with a PGlite driver for local dev. Detail
  in [`src/db/CLAUDE.md`](src/db/CLAUDE.md).
- **Engine**: pure freedom math in `src/lib/finance/` — no I/O, unit-testable.

### The Financial Domain's Components

Each Component is a `src/lib/<x>` core + its UI, with deep notes in its folder `CLAUDE.md`:

| Component (View) | Core | UI | Deep notes |
|------------------|------|----|-----------|
| Vision | `src/lib/vision/` | vision modal + onboarding | [`src/lib/vision/CLAUDE.md`](src/lib/vision/CLAUDE.md) |
| Trajectory (Finance engine) | `src/lib/finance/` | `FinancialDashboard` | [`src/lib/finance/CLAUDE.md`](src/lib/finance/CLAUDE.md) |
| Buckets | `src/lib/buckets/` | `components/buckets/` | [`src/lib/buckets/CLAUDE.md`](src/lib/buckets/CLAUDE.md) |
| Investments | `src/lib/investments/` | `components/investments/` | [`src/lib/investments/CLAUDE.md`](src/lib/investments/CLAUDE.md) |
| Spending | `src/lib/spending/` | `components/spending/` | [`src/lib/spending/CLAUDE.md`](src/lib/spending/CLAUDE.md) |
| Inbox & ingestion | `src/lib/inbox/` | `components/inbox/` | [`src/lib/inbox/CLAUDE.md`](src/lib/inbox/CLAUDE.md) |

The **access layer / DAL** (`src/lib/server/`) is the cross-cutting authorization choke-point that
persists every Component — [`src/lib/server/CLAUDE.md`](src/lib/server/CLAUDE.md). The **UI flow**
(`FreedomApp` + the View toggle + the detail shell) is [`src/components/CLAUDE.md`](src/components/CLAUDE.md).

## Data model & multi-tenancy

- **Instance** = a workspace (yourself; a family; someone you share with later). Every piece of
  user data hangs off an instance; every instance has an `ownerId`. This is how data is segregated
  so the app can serve others, not just one user.
- **Authorization is always checked server-side** — never trust the client with another instance's
  data. Confirm the signed-in user owns/belongs to the instance on every read and write. This is
  centralised in the **DAL** (`src/lib/server/`) — resolve the instance from the session, never
  from a client-supplied id, so there's no IDOR surface.
- Storage shapes (typed columns for engine inputs, one jsonb document per Component, a multi-row
  `inbox_item` table) and the driver setup live in [`src/db/CLAUDE.md`](src/db/CLAUDE.md) and
  [`docs/architecture/data-model.md`](docs/architecture/data-model.md). The user's default instance
  is lazily created on first save.

## Security (utmost priority)

- No secrets or personal/financial data in git. `.env.local` is gitignored; `.env.example`
  documents the keys. Production secrets live in Vercel env / OIDC.
- Validate all input at the boundary with zod. Use Drizzle (parameterised) — never string-built SQL.
- **Planned hardening before any real/shared data**: field-level encryption of monetary figures at
  rest; security headers / CSP; audit trail. (Currently amounts are stored as plain numeric.)
- Sign-in offloads password/MFA risk to Google; we only store the identity link.

## Commands

- `npm run dev` — local app at http://localhost:3000.
- `npm test` — Vitest: pure-`lib` unit tests **plus** the Gherkin behavioural specs under
  `features/` (`@amiceli/vitest-cucumber`); `npm run test:watch` to watch.
- `npm run test:bdd` — just the `features/` behavioural specs.
- `npm run test:e2e` — Playwright journey(s) in `e2e/` (needs a `DATABASE_URL` in `.env.local`;
  launches the dev server on port 3100 with `AUTH_DEV_BYPASS=true`). First run needs browsers:
  `npx playwright install chromium`.
- `npm run docs:generate` — regenerate **both** generated doc trees (behaviour pages from
  `features/**`, architecture / C3 component pages from `src/**`). `npm run docs:dev` to preview,
  `npm run docs:build` to build into `public/docs` (served at `/docs`; needs Mermaid). `npm run
  docs:check` fails if either committed tree is stale; `npm run docs:affected -- --run` runs the
  specs a changed path maps to.
- `npm run lint` — Next.js lint. Type-check: `npx tsc --noEmit`.
- `npx drizzle-kit generate` — create a migration from schema changes.
- `npx drizzle-kit migrate` — apply migrations to `DATABASE_URL` (Neon / wire-protocol).
- `npm run db:local` — apply migrations to the local **PGlite** database
  (`DATABASE_DRIVER=pglite`); re-run after `drizzle-kit generate`.
- `npx auth secret` — generate `AUTH_SECRET`.

New here? Setup is in [`README.md`](README.md); the Vercel production runbook is
[`DEPLOYMENT.md`](DEPLOYMENT.md).

## Conventions

- Pure engine logic in `src/lib/` (no React, no DB). UI in `src/app` + components. The four-file
  Component shape and inward-dependency rule live in [`src/lib/CLAUDE.md`](src/lib/CLAUDE.md).
- Commit/push only when asked.
- **Update the docs as part of every feature — the *nearest* one.** After building or changing
  functionality, update the **folder `CLAUDE.md`** closest to the code you touched (not this root),
  plus any other affected docs, in the same pass. Slot new docs into the **C4 altitude** they
  belong to (C1 context / C2 Domain / C3 Component / C4 Element+schema). The generated
  `docs/architecture/**` and `docs/features/**` trees regenerate via the PostToolUse hook — commit
  the regenerated Markdown alongside your change (`npm run docs:check` enforces it). Keeping the
  *local* notes current is what keeps context clears cheap.

## Where the detailed notes live

Folder-local `CLAUDE.md` files hold the deep narrative and **load automatically** when you work in
that subtree (they are *not* `@import`ed here, so they cost nothing when you're elsewhere):

- [`src/lib/CLAUDE.md`](src/lib/CLAUDE.md) — shared Component conventions (four-file shape,
  recurrence engine, "test the pure core", inward dependencies). Loads for all `src/lib` work.
- Per-Component cores: [`finance`](src/lib/finance/CLAUDE.md) · [`vision`](src/lib/vision/CLAUDE.md)
  · [`buckets`](src/lib/buckets/CLAUDE.md) · [`investments`](src/lib/investments/CLAUDE.md) ·
  [`spending`](src/lib/spending/CLAUDE.md) · [`inbox`](src/lib/inbox/CLAUDE.md) (inbox also holds
  the ingestion philosophy).
- [`src/lib/server/CLAUDE.md`](src/lib/server/CLAUDE.md) — the DAL, auth choke-point,
  extract/reconcile pipeline.
- [`src/components/CLAUDE.md`](src/components/CLAUDE.md) — UI flow, the View toggle, Elements, the
  detail shell, form primitives, Tailwind palette, local previewing.
- [`src/db/CLAUDE.md`](src/db/CLAUDE.md) — schema, Neon/PGlite drivers, migrations.
- [`features/CLAUDE.md`](features/CLAUDE.md) — BDD tiers, `.feature`-as-docs, the C4
  docs-generation pipeline + the PostToolUse hook.

The **structural** view (auto-generated file-responsibility tables per Component) is
[`docs/architecture/components/`](docs/architecture/components/); these `CLAUDE.md` files are the
**narrative / "why"** — cross-referenced, not duplicated.
