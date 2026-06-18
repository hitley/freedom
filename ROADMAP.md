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
- **Feed investments into the projection engine.** Today the investments domain is
  deliberately independent of `src/lib/finance`. Wire portfolio totals into the
  engine's `currentInvested` so the freedom-date trajectory reflects real holdings.
  (Same open question for feeding bucket totals in.)
- **Persistence — the big one.** The captured vision, buckets state, and investments
  state all live in client state with no DB table yet; their zod schemas
  (`freedomVisionSchema` / `bucketsStateSchema` / `investmentsStateSchema`) are ready.
  Add a per-instance table for each, read/written server-side with the same ownership
  checks as `financialProfiles`. This unblocks everything real/shared.

## Security (must land before any real or shared data)

- **Field-level encryption** of monetary figures at rest (amounts are currently plain
  numeric).
- **Security headers / CSP.**
- **Audit trail** for reads/writes of instance data.

## Ingestion (manual now → automated)

- **CSV / statement upload** behind the existing clean ingestion interface.
- **Open Banking / Plaid** automation later, slotting in without touching the engine.
- **Live market prices** via the `PriceProvider` seam (broker / market-data API) —
  the default `manualPriceProvider` returns nothing today, so holdings value at their
  stored manual price.

## Later / bigger bets

- **Dimensions 2 & 3** (e.g. Time, Health) — slots in the same
  vision → current-state → trajectory framework, not yet built.

## Tidy-ups (do when nearby)

- **Shared form primitives.** `MoneyInput`, `PercentInput`, `Field`, `Select`,
  `DateInput` are copy-pasted per editor. Extract a shared module.
