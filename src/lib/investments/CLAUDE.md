# Investments — `src/lib/investments/`

The Investments Component: pure data + helpers for the freedom-generating assets the user
holds — super, shares, ETFs. Each `Holding` is valued one of two ways: **`market`**
(`units × pricePerUnit` — shares/ETFs, so worth moves with the market) or **`balance`** (a
directly-entered value — super, cash). It optionally carries a recurring **`Contribution`**
(reusing the buckets recurrence engine) and a **`Drp`** (dividend reinvestment — an annual
yield reinvested into the holding, compounding value instead of paying cash). `holdingValue`
/ `holdingView` / `summarise` give the today snapshot (total, by-kind split, annual
contributions + dividends), and `simulate(state, from, to)` projects every holding forward on
a monthly grid (compounding growth + reinvested DRP, adding contributions on their real
scheduled dates) into an `InvestmentsTimeline`. A holding can also carry recorded **`history`**
(manual `HoldingSnapshot`s — value + money paid in on a date, e.g. yearly super statements);
`holdingHistory` derives each period's **growth** by stripping out contributions
(`value − prevValue − contributed`), the figure the detail view charts and tables.
`projectHolding(start, from, to, monthlyContribution, annualGrowthPct)` is a single-holding
what-if projection with the two levers passed explicitly (so the detail view can drive live
sliders), with `monthlyContribution` / `assumedAnnualGrowthPct` helpers seeding those levers
from the holding.

**Prices are manual for now** — a live feed slots in via the `PriceProvider` seam
(`manualPriceProvider` is the default, returning no quotes so holdings value at their stored
price; pass a `quotes` map keyed by ticker to override). Investments are deliberately
**independent of the projection engine** for now (feeding totals into `currentInvested` is a
future step). `investmentsStateSchema` is the zod boundary.

See `src/lib/CLAUDE.md` for shared conventions; `docs/architecture/components/investments.md`
for the generated structural view.
