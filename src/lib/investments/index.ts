import { z } from "zod";
import {
  addMonths,
  occurrences,
  recurrenceSchema,
  startOfDay,
} from "@/lib/buckets";
import type {
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

export const holdingSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["super", "shares", "etf", "cash", "other"]),
    valuation: z.enum(["market", "balance"]),
    ticker: z.string().trim().max(12).optional(),
    units: z.number().min(0).max(1e12).optional(),
    pricePerUnit: MONEY.optional(),
    balance: MONEY.optional(),
    expectedReturnPct: PERCENT.optional(),
    contribution: contributionSchema.optional(),
    drp: drpSchema.optional(),
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
