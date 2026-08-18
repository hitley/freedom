# Investments — `src/lib/investments/`

The Investments Component: pure data + helpers for the freedom-generating assets the user
holds — super, shares, ETFs. Each `Holding` is valued one of two ways: **`market`**
(`units × pricePerUnit` — shares/ETFs, so worth moves with the market) or **`balance`** (a
directly-entered value — super, cash). It optionally carries a recurring **`Contribution`**
(reusing the buckets recurrence engine) and a **`Drp`** (dividend reinvestment — an annual
yield reinvested into the holding, compounding value instead of paying cash). `holdingValue`
/ `holdingView` / `summarise` give the today snapshot (total, by-kind split, annual
contributions + dividends, plus **`blendedReturnPct`** — the value-weighted expected return
across holdings, the single growth rate the Trajectory derives from so it can't disagree with
the whole-portfolio projection), and `simulate(state, from, to)` projects every holding forward on
a monthly grid (compounding growth + reinvested DRP, adding contributions on their real
scheduled dates) into an `InvestmentsTimeline`. A holding can also carry recorded **`history`**
(manual `HoldingSnapshot`s — value + money paid in on a date, e.g. yearly super statements);
`holdingHistory` derives each period's **growth** by stripping out contributions
(`value − prevValue − contributed`), the figure the detail view charts and tables.
`projectHolding(start, from, to, monthlyContribution, annualGrowthPct)` is a single-holding
what-if projection with the two levers passed explicitly (so the detail view can drive live
sliders), with `monthlyContribution` / `assumedAnnualGrowthPct` helpers seeding those levers
from the holding. `projectPortfolio(state, from, to, { extraMonthly, growthDeltaPct, quotes })`
is the **whole-portfolio** equivalent behind `PortfolioDetail`: with no levers it equals
`simulate`'s `total` exactly (so the detail view reconciles with the summary's "Projected in 1
year"), then two global levers layer on — an `extraMonthly` contribution compounded in its own
pot at the value-weighted blended rate, and a `growthDeltaPct` nudge added to every holding's
assumed return. Call it on a **home-currency** state (FX already applied), as `simulate` is.

**Prices are manual for now** — a live feed slots in via the `PriceProvider` seam
(`manualPriceProvider` is the default, returning no quotes so holdings value at their stored
price; pass a `quotes` map keyed by ticker to override). Investments are deliberately
**independent of the projection engine** for now (feeding totals into `currentInvested` is a
future step). `investmentsStateSchema` is the zod boundary.

**Foreign-currency holdings.** The app totals everything in a single **home currency**
(`HOME_CURRENCY` in `@/lib/money` — currently `AUD`). A holding may instead be recorded in its
own currency via an optional `Holding.currency` (ISO-4217, e.g. a UK pension in `"GBP"`); its
stored amounts (`balance` / `pricePerUnit` / `contribution` / `history`) stay in that currency
and are converted to the home currency **for display and aggregation only**. `convertToHome`
(and per-holding `convertHolding` / `holdingRate`) is the pure adapter: it scales every
monetary field by the FX rate (home units per 1 foreign unit) and clears `currency`, so the
rest of the math (`summarise`, `simulate`, the Trajectory sync) never sees a foreign amount.
A holding with no `currency` (or one equal to home) passes through unchanged — so existing data
and the whole pipeline are untouched. Rates mirror the price seam: the `FxProvider` shape +
`manualFxProvider` default, with the **live** source being the `useFxRates` hook
(`src/components/investments/useFxRates.ts`) — cache-first from `localStorage` (instant +
offline), then a background fetch from `api.frankfurter.dev` (ECB daily rates, no key; the
request carries only currency codes) that re-renders converted figures when the rate moves.
The editor captures a holding in its own currency; the panel shows the converted home value
with a native subtext and a one-line rate/as-of/offline indicator. **Note:** the amounts stay
in native currency at rest, so the portfolio re-values automatically as FX drifts.

See `src/lib/CLAUDE.md` for shared conventions; `docs/architecture/components/investments.md`
for the generated structural view.
