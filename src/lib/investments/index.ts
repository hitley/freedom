import { z } from "zod";
import {
  addMonths,
  occurrences,
  recurrenceSchema,
  startOfDay,
} from "@/lib/buckets";
import { HOME_CURRENCY } from "@/lib/money";
import type {
  FxProvider,
  FxRates,
  HistoryPeriod,
  Holding,
  HoldingView,
  InvestmentsState,
  InvestmentsSummary,
  PriceProvider,
  Quote,
} from "./types";
import { DIVIDEND_FREQS } from "./types";

export * from "./types";

/* ----------------------------------------------------------------------------
 * Currency conversion. A holding recorded in a foreign currency carries its
 * amounts in that currency; converting to the home currency multiplies every
 * monetary field by the rate (home units per 1 foreign unit). Percentages (growth,
 * DRP yield) and unit counts are currency-independent and pass through untouched.
 * Pure — the live rate is fetched at the edge (`useFxRates`) and threaded in.
 * ------------------------------------------------------------------------- */

/** The home-currency rate for a holding: 1 when it's already home or unrated. */
export function holdingRate(holding: Holding, rates?: FxRates): number {
  const code = holding.currency?.toUpperCase();
  if (!code || code === HOME_CURRENCY) return 1;
  return rates?.[code] ?? 1;
}

/**
 * Convert one holding into the home currency, scaling every monetary field by the
 * FX rate and clearing `currency` (the result is home-denominated). A holding
 * already in the home currency — or one whose rate is missing (offline before the
 * first fetch) — is returned unchanged, so downstream math never sees a foreign
 * amount half-converted.
 */
export function convertHolding(holding: Holding, rates?: FxRates): Holding {
  const rate = holdingRate(holding, rates);
  if (rate === 1) return holding;
  return {
    ...holding,
    currency: undefined,
    pricePerUnit: holding.pricePerUnit === undefined ? undefined : holding.pricePerUnit * rate,
    balance: holding.balance === undefined ? undefined : holding.balance * rate,
    contribution: holding.contribution
      ? { ...holding.contribution, amount: holding.contribution.amount * rate }
      : undefined,
    history: holding.history?.map((s) => ({
      ...s,
      value: s.value * rate,
      contributed: s.contributed === undefined ? undefined : s.contributed * rate,
    })),
  };
}

/** Convert an entire portfolio into the home currency (see `convertHolding`). */
export function convertToHome(state: InvestmentsState, rates?: FxRates): InvestmentsState {
  if (!rates || state.holdings.every((h) => holdingRate(h, rates) === 1)) return state;
  return { holdings: state.holdings.map((h) => convertHolding(h, rates)) };
}

/* ----------------------------------------------------------------------------
 * Pure helpers. No I/O, no React — given holdings (and optional live quotes),
 * derive what the UI shows. Quotes are keyed by upper-case ticker; when absent a
 * market holding falls back to its manually-entered `pricePerUnit`.
 * ------------------------------------------------------------------------- */

/** Look up a live quote for a holding, if one was supplied. */
function quoteFor(
  holding: Holding,
  quotes?: Record<string, Quote>,
): Quote | undefined {
  if (!holding.ticker || !quotes) return undefined;
  return quotes[holding.ticker.toUpperCase()];
}

/** The price used for a market holding: live quote if present, else the manual price. */
export function holdingPrice(
  holding: Holding,
  quotes?: Record<string, Quote>,
): number | null {
  if (holding.valuation !== "market") return null;
  return quoteFor(holding, quotes)?.price ?? holding.pricePerUnit ?? 0;
}

/** A holding's current value: `units × price` (market) or `balance`. */
export function holdingValue(
  holding: Holding,
  quotes?: Record<string, Quote>,
): number {
  if (holding.valuation === "market") {
    return (holding.units ?? 0) * (holdingPrice(holding, quotes) ?? 0);
  }
  return holding.balance ?? 0;
}

/**
 * Roughly how much a recurring contribution adds over a year. Approximate by
 * design — `weekly`/`monthly` scale by their interval; a `once` contribution
 * isn't an annual rate, so it counts as 0 here. The look-ahead in `simulate`
 * uses exact dates when precision matters.
 */
export function annualContribution(holding: Holding): number {
  const c = holding.contribution;
  if (!c) return 0;
  const { freq, interval = 1 } = c.recurrence;
  const n = Math.max(1, interval);
  if (freq === "weekly") return (c.amount * 52) / n;
  if (freq === "monthly") return (c.amount * 12) / n;
  return 0; // once
}

/** A holding's dividend over a year (reinvested under DRP, otherwise cash income). */
export function annualDividend(
  holding: Holding,
  quotes?: Record<string, Quote>,
): number {
  if (!holding.drp) return 0;
  return holdingValue(holding, quotes) * (holding.drp.annualYieldPct / 100);
}

/**
 * Derive each period of a holding's recorded history. Snapshots are sorted oldest
 * first, then for each one we compute the investment growth over the period since
 * the previous snapshot: `value - prevValue - contributed`. The contributions are
 * stripped out so growth reflects the market/return, not money you added. The
 * first record has nothing to compare against, so its growth is null.
 */
export function holdingHistory(holding: Holding): HistoryPeriod[] {
  const snaps = [...(holding.history ?? [])].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  return snaps.map((s, i) => {
    const prev = i > 0 ? snaps[i - 1] : null;
    const contributed = s.contributed ?? 0;
    const prevValue = prev ? prev.value : null;
    const growth = prevValue === null ? null : s.value - prevValue - contributed;
    const base = prevValue === null ? 0 : prevValue + contributed;
    return {
      date: s.date,
      value: s.value,
      prevValue,
      contributed,
      growth,
      growthPct: growth === null || base <= 0 ? null : (growth / base) * 100,
    };
  });
}

/** Monthly growth rate folding in expected return and any reinvested dividend yield. */
function monthlyGrowthRate(holding: Holding): number {
  const growth = holding.expectedReturnPct ?? 0;
  const drpYield = holding.drp ? holding.drp.annualYieldPct : 0;
  return (growth + drpYield) / 100 / 12;
}

/** The today snapshot for a single holding. */
export function holdingView(
  holding: Holding,
  quotes?: Record<string, Quote>,
): HoldingView {
  const value = holdingValue(holding, quotes);
  const liveQuote = quoteFor(holding, quotes);
  return {
    value,
    price: holdingPrice(holding, quotes),
    priced: !!liveQuote,
    annualContribution: annualContribution(holding),
    annualDividend: annualDividend(holding, quotes),
  };
}

/* ----------------------------------------------------------------------------
 * Look-ahead. Replay growth, reinvested dividends, and recurring contributions
 * forward on a monthly grid. Each month a holding compounds at its growth rate
 * (expected return + reinvested DRP yield) and gains any contributions whose
 * scheduled dates fell within the month. Pure and deterministic.
 * ------------------------------------------------------------------------- */

/** A value path over time: `dates[i]` carries `total[i]` and `byHolding[id][i]`. */
export interface InvestmentsTimeline {
  dates: Date[];
  /** Projected portfolio total, aligned to `dates`. */
  total: number[];
  /** Projected value per holding id, aligned to `dates`. */
  byHolding: Record<string, number[]>;
}

/**
 * Project every holding from `from` to `to` on a monthly grid (inclusive of
 * both ends). Contributions use their real scheduled dates via the buckets
 * recurrence engine, so a fortnightly buy lands the right number of times.
 */
export function simulate(
  state: InvestmentsState,
  from: Date,
  to: Date,
  quotes?: Record<string, Quote>,
): InvestmentsTimeline {
  const start = startOfDay(from);
  const end = startOfDay(to);

  // Monthly markers from start through end (inclusive).
  const markers: Date[] = [];
  for (let d = start; d.getTime() <= end.getTime(); d = addMonths(d, 1)) {
    markers.push(d);
  }
  if (markers[markers.length - 1]?.getTime() !== end.getTime()) markers.push(end);

  const value: Record<string, number> = {};
  for (const h of state.holdings) value[h.id] = holdingValue(h, quotes);

  const timeline: InvestmentsTimeline = {
    dates: [],
    total: [],
    byHolding: Object.fromEntries(state.holdings.map((h) => [h.id, []])),
  };

  for (let i = 0; i < markers.length; i++) {
    if (i > 0) {
      const prev = markers[i - 1];
      const marker = markers[i];
      for (const h of state.holdings) {
        // Compound one month of growth + reinvested dividends.
        value[h.id] = value[h.id] * (1 + monthlyGrowthRate(h));
        // Add contributions scheduled in (prev, marker].
        if (h.contribution) {
          const hits = occurrences(h.contribution.recurrence, prev, marker);
          value[h.id] += hits.length * h.contribution.amount;
        }
      }
    }

    timeline.dates.push(markers[i]);
    let total = 0;
    for (const h of state.holdings) {
      const v = value[h.id] ?? 0;
      timeline.byHolding[h.id].push(v);
      total += v;
    }
    timeline.total.push(total);
  }

  return timeline;
}

/** A single holding's projected value path, aligned to `dates`. */
export interface HoldingProjection {
  dates: Date[];
  /** Projected value at each marker. */
  value: number[];
  /** Cumulative contributions added by each marker (for the stacked breakdown). */
  contributed: number[];
}

/**
 * Project one holding forward on a monthly grid for the detail-view what-if. Unlike
 * `simulate`, the two key levers are passed explicitly so the UI can offer live
 * sliders: a flat `monthlyContribution` (money added each month) and a single
 * `annualGrowthPct` (which already folds in any reinvested dividend). Compounding
 * matches `simulate` — one month of growth, then the month's contribution.
 */
export function projectHolding(
  startValue: number,
  from: Date,
  to: Date,
  monthlyContribution: number,
  annualGrowthPct: number,
): HoldingProjection {
  const start = startOfDay(from);
  const end = startOfDay(to);
  const monthly = annualGrowthPct / 100 / 12;

  const proj: HoldingProjection = { dates: [], value: [], contributed: [] };
  let value = startValue;
  let contributed = 0;
  let first = true;
  for (let d = start; d.getTime() <= end.getTime(); d = addMonths(d, 1)) {
    if (!first) {
      value = value * (1 + monthly) + monthlyContribution;
      contributed += monthlyContribution;
    }
    first = false;
    proj.dates.push(d);
    proj.value.push(value);
    proj.contributed.push(contributed);
  }
  return proj;
}

/** The monthly-equivalent of a holding's recurring contribution (annual ÷ 12). */
export function monthlyContribution(holding: Holding): number {
  return annualContribution(holding) / 12;
}

/** A holding's assumed annual growth, including reinvested dividend yield. */
export function assumedAnnualGrowthPct(holding: Holding): number {
  return (holding.expectedReturnPct ?? 0) + (holding.drp?.annualYieldPct ?? 0);
}

/** Whole-portfolio rollup for the summary header. */
export function summarise(
  state: InvestmentsState,
  quotes?: Record<string, Quote>,
): InvestmentsSummary {
  const byKindMap = new Map<Holding["kind"], number>();
  let totalValue = 0;
  let annualContributions = 0;
  let annualDividends = 0;

  for (const h of state.holdings) {
    const value = holdingValue(h, quotes);
    totalValue += value;
    byKindMap.set(h.kind, (byKindMap.get(h.kind) ?? 0) + value);
    annualContributions += annualContribution(h);
    annualDividends += annualDividend(h, quotes);
  }

  const today = startOfDay(new Date());
  const oneYear = simulate(state, today, addMonths(today, 12), quotes);

  return {
    totalValue,
    byKind: [...byKindMap.entries()].map(([kind, value]) => ({ kind, value })),
    annualContributions,
    annualDividends,
    projectedValue1y: oneYear.total[oneYear.total.length - 1] ?? totalValue,
  };
}

/** The whole portfolio's projected value path, aligned to `dates`. */
export interface PortfolioProjection {
  dates: Date[];
  /** Total portfolio value at each marker. */
  value: number[];
  /** Cumulative contributions (scheduled + any extra lever) by each marker. */
  contributed: number[];
}

/**
 * Project the whole portfolio forward on a monthly grid for the portfolio detail
 * what-if. With no levers this equals `simulate`'s `total` exactly, so the detail
 * view reconciles with the summary's headline. Two global levers layer on top:
 *   - `extraMonthly` — extra money added every month beyond scheduled contributions,
 *     compounded in its own pot at the portfolio's value-weighted blended rate;
 *   - `growthDeltaPct` — an optimistic/pessimistic nudge added to every holding's
 *     assumed annual growth (and to the extra pot).
 * Call it on a home-currency `state` (FX already applied), exactly as `simulate` is.
 */
export function projectPortfolio(
  state: InvestmentsState,
  from: Date,
  to: Date,
  opts: { extraMonthly?: number; growthDeltaPct?: number; quotes?: Record<string, Quote> } = {},
): PortfolioProjection {
  const { extraMonthly = 0, growthDeltaPct = 0, quotes } = opts;
  const start = startOfDay(from);
  const end = startOfDay(to);
  const deltaMonthly = growthDeltaPct / 100 / 12;

  const markers: Date[] = [];
  for (let d = start; d.getTime() <= end.getTime(); d = addMonths(d, 1)) markers.push(d);
  if (markers[markers.length - 1]?.getTime() !== end.getTime()) markers.push(end);

  const value: Record<string, number> = {};
  let start0 = 0;
  for (const h of state.holdings) {
    value[h.id] = holdingValue(h, quotes);
    start0 += value[h.id];
  }
  // Value-weighted blended monthly growth at t0 — the rate the extra pot compounds at.
  const blendedMonthly =
    start0 > 0
      ? state.holdings.reduce((s, h) => s + holdingValue(h, quotes) * monthlyGrowthRate(h), 0) / start0
      : 0;

  const proj: PortfolioProjection = { dates: [], value: [], contributed: [] };
  let extraPot = 0;
  let contributed = 0;
  for (let i = 0; i < markers.length; i++) {
    if (i > 0) {
      const prev = markers[i - 1];
      const marker = markers[i];
      for (const h of state.holdings) {
        value[h.id] = value[h.id] * (1 + monthlyGrowthRate(h) + deltaMonthly);
        if (h.contribution) {
          const added =
            occurrences(h.contribution.recurrence, prev, marker).length * h.contribution.amount;
          value[h.id] += added;
          contributed += added;
        }
      }
      extraPot = extraPot * (1 + blendedMonthly + deltaMonthly) + extraMonthly;
      contributed += extraMonthly;
    }
    let total = extraPot;
    for (const h of state.holdings) total += value[h.id];
    proj.dates.push(markers[i]);
    proj.value.push(total);
    proj.contributed.push(contributed);
  }
  return proj;
}

/**
 * The default price provider: returns no quotes, so every market holding values
 * at its stored manual price. Swap in a live implementation (broker/market-data
 * API) later — nothing else changes.
 */
export const manualPriceProvider: PriceProvider = {
  async quotes() {
    return {};
  },
};

/**
 * The default FX provider: returns no rates, so every holding values at its stored
 * amount (home currency assumed). The live `useFxRates` hook supplies real rates
 * in the UI; a server-side feed could implement this same shape later.
 */
export const manualFxProvider: FxProvider = {
  async rates() {
    return {};
  },
};

/* ----------------------------------------------------------------------------
 * Validation at the trust boundary. Anything from the editor, an API, or an
 * import passes through here before it's stored or trusted. (No DB yet — this is
 * ready for when investments are persisted per instance, like the buckets state.)
 * ------------------------------------------------------------------------- */

const MONEY = z.number().min(0).max(1e11);
const PERCENT = z.number().min(0).max(100);

export const contributionSchema = z.object({
  amount: MONEY,
  recurrence: recurrenceSchema,
});

export const drpSchema = z.object({
  annualYieldPct: PERCENT,
  frequency: z.enum(DIVIDEND_FREQS.map((f) => f.id) as [string, ...string[]]),
});

export const holdingSnapshotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date"),
  value: MONEY,
  contributed: MONEY.optional(),
});

export const holdingSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["super", "shares", "etf", "cash", "other"]),
    valuation: z.enum(["market", "balance"]),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, "expected a 3-letter ISO currency code")
      .transform((c) => c.toUpperCase())
      .optional(),
    ticker: z.string().trim().max(12).optional(),
    units: z.number().min(0).max(1e12).optional(),
    pricePerUnit: MONEY.optional(),
    balance: MONEY.optional(),
    expectedReturnPct: PERCENT.optional(),
    contribution: contributionSchema.optional(),
    drp: drpSchema.optional(),
    history: z.array(holdingSnapshotSchema).optional(),
  })
  .refine(
    (h) =>
      h.valuation === "market"
        ? h.units !== undefined && h.pricePerUnit !== undefined
        : h.balance !== undefined,
    { message: "market holdings need units + price; balance holdings need a balance" },
  );

export const investmentsStateSchema = z.object({
  holdings: z.array(holdingSchema),
});

export type InvestmentsStateInput = z.input<typeof investmentsStateSchema>;
