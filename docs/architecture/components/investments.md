# 📈 Investments

_The freedom-generating assets the user holds, valued and projected forward._

::: tip Generated from source
This page is generated from the code: file descriptions come from each file's header comment, the model from `types.ts`, and the behaviours from the `@source` tags on the feature specs. Improve the code's comments to enrich it.
:::

## Components

### Domain (pure)

| File | Responsibility |
| --- | --- |
| `index.ts` | _—_ |
| `types.ts` | Domain types for **investments** — the freedom-generating assets the user holds: superannuation, shares, and ETFs. |

### Access layer (server)

| File | Responsibility |
| --- | --- |
| `investments.ts` | _—_ |

### UI

| File | Responsibility |
| --- | --- |
| `HoldingDetail.tsx` | _—_ |
| `HoldingEditor.tsx` | _—_ |
| `InvestmentsPanel.tsx` | _—_ |

## Model

The data types this context owns (from `types.ts`).

| Type | Kind | Description |
| --- | --- | --- |
| `HoldingKind` | type | What kind of asset a holding is. Drives grouping and the default valuation. |
| `Valuation` | type | How a holding's current value is derived: - `market` — `units × pricePerUnit` (shares, ETFs). Price is manual now; a live quote overrides it when a `PriceProvider` is wired in. - `balance` — a directly-entered value (super, cash) where you just know the balance, not a unit count. |
| `HoldingSnapshot` | interface | A recorded point in a holding's past: what it was actually worth on a date, and how much money you put in over the period leading up to it. Consecutive snapshots let us derive the *growth* for each period — `value - prevValue - contributed` — which is the figure you can't read off either number alone. Entered manually (e.g. yearly super statements); see `holdingHistory` in `index.ts`. |
| `Contribution` | interface | A recurring money-in to a holding (super contribution, regular ETF buy). |
| `DividendFreq` | type | How often dividends are paid (and, under DRP, reinvested). |
| `Drp` | interface | A dividend reinvestment plan: the holding pays a dividend that is reinvested to buy more of itself, compounding value rather than paying out cash. Modelled as an annual yield on the holding's value; the look-ahead compounds it forward. |
| `Holding` | interface | One position the user holds. Value depends on `valuation` (see above). |
| `InvestmentsState` | interface | The full client-side state: every holding the user tracks. |
| `Quote` | interface | A market quote for a ticker. `asOf` is a date-only ISO string. |
| `PriceProvider` | interface | Resolves live prices for a set of tickers. Keyed by ticker (upper-case). |
| `HoldingView` | interface | A holding enriched with the today-snapshot figures the UI needs. |
| `HistoryPeriod` | interface | One period in a holding's history, derived from consecutive snapshots. The first period has no `prevValue`/`growth` (nothing to compare against). |
| `InvestmentsSummary` | interface | Whole-portfolio rollup for the summary header. |

## Behaviours

_No behavioural specs target this context yet._
