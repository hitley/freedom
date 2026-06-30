/**
 * Component types for **investments** — the freedom-generating assets the user
 * holds: superannuation, shares, and ETFs.
 *
 * Two things make this more than a list of balances:
 *  - **Market-priced holdings** (shares, ETFs) are valued `units × pricePerUnit`,
 *    so their worth moves with the market. The price is entered manually for now;
 *    a live feed slots in later via the `PriceProvider` seam (see `index.ts`)
 *    without touching this Component.
 *  - **Recurring contributions** (e.g. monthly super or a regular ETF purchase)
 *    and **dividend reinvestment (DRP)** — dividends that buy more of the holding
 *    instead of paying out as cash — both grow a holding over time. The look-ahead
 *    in `index.ts` replays them forward.
 *
 * Everything here is plain data — no DB, no framework, no I/O — so the helpers in
 * `index.ts` stay pure and unit-testable. Persistence/validation at the edges.
 */

import type { Recurrence } from "@/lib/buckets";

/** What kind of asset a holding is. Drives grouping and the default valuation. */
export type HoldingKind = "super" | "shares" | "etf" | "cash" | "other";

/**
 * How a holding's current value is derived:
 *  - `market` — `units × pricePerUnit` (shares, ETFs). Price is manual now; a
 *    live quote overrides it when a `PriceProvider` is wired in.
 *  - `balance` — a directly-entered value (super, cash) where you just know the
 *    balance, not a unit count.
 */
export type Valuation = "market" | "balance";

/**
 * A recorded point in a holding's past: what it was actually worth on a date, and
 * how much money you put in over the period leading up to it. Consecutive snapshots
 * let us derive the *growth* for each period — `value - prevValue - contributed` —
 * which is the figure you can't read off either number alone. Entered manually
 * (e.g. yearly super statements); see `holdingHistory` in `index.ts`.
 */
export interface HoldingSnapshot {
  /** When this value was recorded — a date-only ISO string (e.g. "2024-06-30"). */
  date: string;
  /** The holding's value on that date, in GBP. */
  value: number;
  /** Money contributed over the period since the previous snapshot, in GBP. */
  contributed?: number;
}

/** A recurring money-in to a holding (super contribution, regular ETF buy). */
export interface Contribution {
  /** Amount per occurrence, in GBP. */
  amount: number;
  /** When it repeats — reuses the buckets recurrence engine. */
  recurrence: Recurrence;
}

/** How often dividends are paid (and, under DRP, reinvested). */
export type DividendFreq = "monthly" | "quarterly" | "semiannual" | "annual";

/**
 * A dividend reinvestment plan: the holding pays a dividend that is reinvested to
 * buy more of itself, compounding value rather than paying out cash. Modelled as
 * an annual yield on the holding's value; the look-ahead compounds it forward.
 */
export interface Drp {
  /** Annual dividend yield, as a percent of value e.g. 4 = 4%. */
  annualYieldPct: number;
  /** Payment cadence — informational; the projection compounds the yield monthly. */
  frequency: DividendFreq;
}

/** One position the user holds. Value depends on `valuation` (see above). */
export interface Holding {
  id: string;
  /** Display name, e.g. "AustralianSuper" or "Vanguard VAS". */
  name: string;
  kind: HoldingKind;
  valuation: Valuation;
  /** `market` only: the symbol a live price feed would resolve (e.g. "VAS"). */
  ticker?: string;
  /** `market` only: units/shares held. */
  units?: number;
  /** `market` only: manual price per unit, in GBP. Overridden by a live quote. */
  pricePerUnit?: number;
  /** `balance` only: the directly-entered current value, in GBP. */
  balance?: number;
  /** Expected nominal annual growth of the underlying, as a percent e.g. 5 = 5%. */
  expectedReturnPct?: number;
  /** Optional recurring money-in. */
  contribution?: Contribution;
  /** Optional dividend reinvestment plan (typically on `market` holdings). */
  drp?: Drp;
  /** Optional recorded past values, oldest-first by date — the tracking history. */
  history?: HoldingSnapshot[];
}

/** The full client-side state: every holding the user tracks. */
export interface InvestmentsState {
  holdings: Holding[];
}

/* ----------------------------------------------------------------------------
 * Price feed seam. Manual today (holdings carry their own `pricePerUnit`); a
 * live provider (broker API, market-data vendor) implements `PriceProvider`
 * later with no change to the Component or UI value math.
 * ------------------------------------------------------------------------- */

/** A market quote for a ticker. `asOf` is a date-only ISO string. */
export interface Quote {
  ticker: string;
  price: number;
  asOf: string;
}

/** Resolves live prices for a set of tickers. Keyed by ticker (upper-case). */
export interface PriceProvider {
  quotes(tickers: string[]): Promise<Record<string, Quote>>;
}

/** A holding enriched with the today-snapshot figures the UI needs. */
export interface HoldingView {
  /** Current value: `units × price` (market) or `balance`. */
  value: number;
  /** The price used, for market holdings (live quote ?? manual). */
  price: number | null;
  /** True when a live quote (not the manual price) supplied the value. */
  priced: boolean;
  /** Estimated contributions added over a year, in GBP. */
  annualContribution: number;
  /** Estimated dividend over a year (reinvested if DRP, else cash income). */
  annualDividend: number;
}

/**
 * One period in a holding's history, derived from consecutive snapshots. The
 * first period has no `prevValue`/`growth` (nothing to compare against).
 */
export interface HistoryPeriod {
  /** The snapshot this period ends on. */
  date: string;
  /** Value at the end of the period. */
  value: number;
  /** Value at the previous snapshot, or null for the first record. */
  prevValue: number | null;
  /** Money contributed during the period. */
  contributed: number;
  /** Investment growth over the period: `value - prevValue - contributed`. */
  growth: number | null;
  /** Growth as a percent of the opening base (`prevValue + contributed`). */
  growthPct: number | null;
}

/** Whole-portfolio rollup for the summary header. */
export interface InvestmentsSummary {
  /** Sum of every holding's current value. */
  totalValue: number;
  /** Value broken down by holding kind. */
  byKind: { kind: HoldingKind; value: number }[];
  /** Total recurring contributions across all holdings, per year. */
  annualContributions: number;
  /** Total dividends per year (reinvested + cash). */
  annualDividends: number;
  /** Projected total value one year out (growth + contributions + DRP). */
  projectedValue1y: number;
}

/** Human labels for holding kinds, for selects and chips. First is the default. */
export const HOLDING_KINDS: { id: HoldingKind; label: string; valuation: Valuation; glyph: string }[] = [
  { id: "super", label: "Super", valuation: "balance", glyph: "🏦" },
  { id: "shares", label: "Shares", valuation: "market", glyph: "📈" },
  { id: "etf", label: "ETF", valuation: "market", glyph: "🧺" },
  { id: "cash", label: "Cash", valuation: "balance", glyph: "💵" },
  { id: "other", label: "Other", valuation: "balance", glyph: "✨" },
];

/** Human labels for dividend frequencies, with their per-year count. */
export const DIVIDEND_FREQS: { id: DividendFreq; label: string; perYear: number }[] = [
  { id: "monthly", label: "Monthly", perYear: 12 },
  { id: "quarterly", label: "Quarterly", perYear: 4 },
  { id: "semiannual", label: "Half-yearly", perYear: 2 },
  { id: "annual", label: "Yearly", perYear: 1 },
];
