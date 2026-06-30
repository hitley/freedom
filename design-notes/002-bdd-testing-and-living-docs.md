# 002 — BDD behavioural specs & living user documentation

- **Date:** 2026-06-24
- **Status:** building — Tier 1 (Gherkin specs in Vitest), Tier 2 (Playwright journey),
  **and** the VitePress `/docs` generation are all wired and running. Docs regenerate
  via a Claude Code PostToolUse hook (chosen over a git/CI trigger). Remaining ideas:
  a CI `docs:check` guard for non-Claude contributors, and pulling component doc-comments
  into the generated pages.
- **Summary:** Describe the *intended behaviour* of the system in Gherkin `.feature`
  files, validate them two ways (fast in-process specs for the component/pipeline, a thin
  layer of real-browser journeys for the full-stack seams), and treat those same
  feature files as the seed for generated, always-true user documentation.

## The idea (as raised)

Not 100% unit coverage. Describe the behaviour and *intent* of the system, then
validate the system does that — BDD style (Playwright used before for this). And
eventually turn these tests + clean code into **user documentation**, published with
VitePress on a `/docs` endpoint.

## Core decision: two tiers, one vocabulary

Most of this app's *intent* lives **below the UI** — in the pure `src/lib` components and
the server-side ingestion pipeline. A browser is the wrong (slow, flaky) place to pin
down "a spend event empties its bucket on its date" or "Reconcile refuses rows that
didn't come from this item". So we split by where the behaviour actually lives, but
keep a single Gherkin vocabulary across both:

```
Tier 1 — Behavioural specs (the bulk)     Tier 2 — Journeys (a thin layer)
  .feature → Vitest (in-process)            .feature-style → Playwright (real browser)
  pure components + server pipeline          full-stack seams only
  milliseconds, no infra                    needs dev server + database
```

- **Tier 1** uses **`@amiceli/vitest-cucumber`**: real `.feature` files bound to step
  definitions, running *inside* Vitest (same runner, alias, and Node env as the unit
  tests). Two flavours:
  - **Pure component** (`features/spending/annualised-spend.feature`) — no infra at all;
    steps call the component helpers directly. This is the default shape.
  - **Server pipeline** (`features/ingestion/extract.feature`, `reconcile.feature`) —
    drives the *real* `extract.ts` / `reconcile.ts`, with the DB-backed DAL swapped for
    an in-memory fake (`features/support/dal-fake.ts`) via `vi.mock`. `server-only` is
    aliased to a no-op stub in `vitest.config.ts` so the server modules import cleanly
    under Node. No Postgres, still exercises the actual pipeline logic + trust boundary.
- **Tier 2** uses **Playwright** (`e2e/ingestion.spec.ts`): the one journey that only
  exists fully wired — drop a CSV → Process → Review → approve → it appears in Spending
  tagged "imported". Runs against the dev server on port 3100 with `AUTH_DEV_BYPASS=true`
  (no Google round-trip), but **needs a real `DATABASE_URL`** in `.env.local`;
  `e2e/global-setup.ts` fails fast with guidance if it's missing.

**Why two tiers and not just Playwright:** Playwright would test the *rendering*, not
the *rule*, and pays a heavy infra/flake tax per test. The rules are cheaper and more
precisely pinned in-process. Playwright is rationed to a handful of crossing-everything
journeys — a smoke layer, not a regression net.

## Forks chosen

- **`.feature` files vs plain `describe/it` with a Given/When/Then voice.** Chose real
  Gherkin. The extra step-definition indirection is a real cost, but the `.feature`
  files are **also the documentation source** (see below) — that dual use justifies
  Gherkin as the source of truth. (Had docs not been a goal, plain Vitest naming would
  have won.)
- **`@amiceli/vitest-cucumber` vs `jest-cucumber` / a separate Cucumber runner.** Chose
  amiceli: it reuses the Vitest runner we already have (one `npm test`, one config, the
  `@` alias), rather than standing up a second test stack.
- **Where features live.** A top-level `features/` tree organised by capability
  (`ingestion/`, `spending/`), not co-located under `src/`. A single home makes them
  legible as a behaviour catalogue and is the obvious input directory for doc generation.
- **Faking the DAL vs a test database for Tier 1.** Faked it (in-memory `store`). The
  ingestion specs are about *pipeline behaviour and the trust boundary*, not auth or
  SQL; a DB would only add slowness and flake. Authorization stays the DAL's concern and
  is out of scope for these specs (the real `requireInstance` checks aren't re-tested).

## The living-docs path (built)

The goal — **user documentation that can't drift**, generated from the same `.feature`
files the tests enforce — is now wired:

1. Every `.feature` is written in **user-facing language** — the `Feature:` free-text
   block explains *why* the behaviour matters; these read as prose. Features are written
   for a human reader first, a test second.
2. `scripts/feature-docs.mjs` parses each feature with **`@amiceli/vitest-cucumber`'s
   `loadFeature`** — the *same* parser the specs run through, so docs and tests can't
   diverge — and renders one Markdown page per feature (title, description prose,
   Background, scenarios as Given/When/Then with docstrings/datatables). `generate-…`
   writes them; `check-…` regenerates in memory and diffs to prove they're current.
3. **VitePress** (`docs/`) consumes that Markdown, `base: "/docs/"`, building into
   `public/docs` — Next serves `public/` at the root, so the static site lives at `/docs`.
   The Next `build` script runs `docs:build` first, so `/docs` ships on every deploy.
   (Chose static VitePress over a Next route group — it's what VitePress is for, and keeps
   the docs build off the app's critical path.)
4. **Source→spec intent** is co-located as `@source:<path>` Gherkin tags on each feature.
   `scripts/affected-specs.mjs` maps a changed application path to the specs that describe
   it (and flags changed `src/lib` logic with *no* covering spec).
5. **Regeneration trigger:** a Claude Code **PostToolUse hook**
   (`scripts/claude-feature-hook.mjs`, wired in `.claude/settings.json` on
   `Edit|Write|MultiEdit`). On a relevant edit it regenerates docs (if a `.feature`
   changed) and runs just the affected specs, feeding the result back as context. Chosen
   over a git pre-commit hook (fires for all contributors, runs on every commit) and CI
   (no local feedback) per the brief's "hook" framing — it's advisory, never blocking.

**Deferred:** a CI `docs:check` + BDD run for non-Claude contributors (the hook only
fires in Claude sessions); and the "clean code → docs" half — pulling component doc-comments
into the generated pages alongside the features.

## What this changes elsewhere

- `vitest.config.ts` includes `features/**/*.steps.ts` and aliases `server-only`.
- `package.json`: `test:bdd`, `test:e2e`, `docs:generate|check|affected|dev|build`; the
  `build` script now runs `docs:build` before `next build`.
- `docs/` (VitePress) + `scripts/*.mjs` (generator, checker, affected-specs, hook).
- `.claude/settings.json`: the PostToolUse hook. `.gitignore`: build output ignored, the
  generated `docs/features/**` Markdown committed (it's the staleness-checked artifact).
- `CLAUDE.md` Commands + Patterns updated so the next session knows the tiers + docs exist.
