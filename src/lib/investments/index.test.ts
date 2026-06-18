import { describe, expect, it } from "vitest";
import {
  annualContribution,
  annualDividend,
  holdingHistory,
  holdingPrice,
  holdingValue,
  holdingView,
  investmentsStateSchema,
  projectHolding,
  simulate,
  summarise,
  type Holding,
  type InvestmentsState,
} from "./index";
import { addMonths, startOfDay } from "@/lib/buckets/schedule";

const superHolding: Holding = {
  id: "s",
  name: "Super",
  kind: "super",
  valuation: "balance",
  balance: 100_000,
  expectedReturnPct: 6,
  contribution: {
    amount: 1_000,
    recurrence: { freq: "monthly", startDate: "2026-06-15", dayOfMonth: 15 },
  },
};

const etfHolding: Holding = {
  id: "e",
  name: "VAS",
  kind: "etf",
  valuation: "market",
  ticker: "VAS",
  units: 100,
  pricePerUnit: 90,
  expectedReturnPct: 5,
  drp: { annualYieldPct: 4, frequency: "quarterly" },
};

const state: InvestmentsState = { holdings: [superHolding, etfHolding] };

describe("holdingValue", () => {
  it("values a balance holding at its balance", () => {
    expect(holdingValue(superHolding)).toBe(100_000);
  });

  it("values a market holding at units × manual price", () => {
    expect(holdingValue(etfHolding)).toBe(9_000);
  });

  it("prefers a live quote over the manual price (keyed case-insensitively)", () => {
    const quotes = { VAS: { ticker: "VAS", price: 100, asOf: "2026-06-17" } };
    expect(holdingValue(etfHolding, quotes)).toBe(10_000);
    expect(holdingPrice(etfHolding, quotes)).toBe(100);
    expect(holdingView(etfHolding, quotes).priced).toBe(true);
  });

  it("is not 'priced' when no live quote is supplied", () => {
    expect(holdingView(etfHolding).priced).toBe(false);
  });
});

describe("recurring contributions & dividends", () => {
  it("annualises a monthly contribution", () => {
    expect(annualContribution(superHolding)).toBe(12_000);
  });

  it("halves a fortnightly (interval-2 weekly) contribution vs weekly", () => {
    const weekly: Holding = {
      ...superHolding,
      contribution: { amount: 100, recurrence: { freq: "weekly", startDate: "2026-06-15", weekday: 5 } },
    };
    const fortnightly: Holding = {
      ...weekly,
      contribution: { ...weekly.contribution!, recurrence: { ...weekly.contribution!.recurrence, interval: 2 } },
    };
    expect(annualContribution(weekly)).toBe(5_200); // 100 × 52
    expect(annualContribution(fortnightly)).toBe(2_600); // 100 × 26
  });

  it("treats a one-off contribution as a zero annual rate", () => {
    const once: Holding = {
      ...superHolding,
      contribution: { amount: 5_000, recurrence: { freq: "once", startDate: "2026-07-01" } },
    };
    expect(annualContribution(once)).toBe(0);
  });

  it("returns a dividend only when DRP is set, as yield × value", () => {
    expect(annualDividend(etfHolding)).toBeCloseTo(360); // 9000 × 4%
    expect(annualDividend(superHolding)).toBe(0);
  });
});

describe("summarise", () => {
  const s = summarise(state);

  it("totals every holding's value", () => {
    expect(s.totalValue).toBe(109_000);
  });

  it("breaks value down by kind", () => {
    expect(s.byKind).toEqual([
      { kind: "super", value: 100_000 },
      { kind: "etf", value: 9_000 },
    ]);
  });

  it("rolls up contributions and dividends across holdings", () => {
    expect(s.annualContributions).toBe(12_000);
    expect(s.annualDividends).toBeCloseTo(360);
  });

  it("projects forward beyond today's value (growth + contributions + DRP)", () => {
    expect(s.projectedValue1y).toBeGreaterThan(s.totalValue);
  });
});

describe("simulate", () => {
  it("emits one marker per month inclusive of both ends", () => {
    const from = startOfDay(new Date(2026, 5, 17));
    const tl = simulate(state, from, addMonths(from, 12));
    expect(tl.dates).toHaveLength(13);
    expect(tl.total).toHaveLength(13);
    expect(tl.byHolding["s"]).toHaveLength(13);
  });

  it("starts the series at today's value", () => {
    const from = startOfDay(new Date(2026, 5, 17));
    const tl = simulate(state, from, addMonths(from, 12));
    expect(tl.total[0]).toBe(109_000);
  });
});

describe("holdingHistory", () => {
  const tracked: Holding = {
    ...superHolding,
    history: [
      // deliberately out of order — should sort oldest-first
      { date: "2024-06-30", value: 80_000, contributed: 12_000 },
      { date: "2023-06-30", value: 60_000 },
      { date: "2025-06-30", value: 100_000, contributed: 12_000 },
    ],
  };

  const periods = holdingHistory(tracked);

  it("sorts snapshots oldest-first", () => {
    expect(periods.map((p) => p.date)).toEqual([
      "2023-06-30",
      "2024-06-30",
      "2025-06-30",
    ]);
  });

  it("has no growth for the first record (nothing to compare against)", () => {
    expect(periods[0].growth).toBeNull();
    expect(periods[0].growthPct).toBeNull();
  });

  it("strips contributions out of growth: value - prevValue - contributed", () => {
    // 80k - 60k - 12k contributed = 8k of actual investment growth
    expect(periods[1].growth).toBe(8_000);
    // over an opening base of 60k + 12k = 72k
    expect(periods[1].growthPct).toBeCloseTo((8_000 / 72_000) * 100);
  });

  it("returns an empty array when there is no history", () => {
    expect(holdingHistory(superHolding)).toEqual([]);
  });
});

describe("projectHolding", () => {
  const from = startOfDay(new Date(2026, 5, 15));

  it("grows by contributions alone when growth is 0%", () => {
    const proj = projectHolding(10_000, from, addMonths(from, 12), 100, 0);
    expect(proj.dates).toHaveLength(13);
    expect(proj.value[0]).toBe(10_000);
    // 12 months × £100 added, no growth
    expect(proj.value[12]).toBeCloseTo(11_200);
    expect(proj.contributed[12]).toBe(1_200);
  });

  it("compounds growth on top of contributions", () => {
    const flat = projectHolding(10_000, from, addMonths(from, 12), 0, 0);
    const grown = projectHolding(10_000, from, addMonths(from, 12), 0, 12);
    expect(flat.value[12]).toBe(10_000);
    expect(grown.value[12]).toBeGreaterThan(10_000);
  });
});

describe("investmentsStateSchema", () => {
  it("accepts a well-formed state", () => {
    expect(investmentsStateSchema.safeParse(state).success).toBe(true);
  });

  it("rejects a market holding missing units/price", () => {
    const bad = { holdings: [{ id: "x", name: "Bad", kind: "etf", valuation: "market" }] };
    expect(investmentsStateSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a balance holding missing its balance", () => {
    const bad = { holdings: [{ id: "x", name: "Bad", kind: "super", valuation: "balance" }] };
    expect(investmentsStateSchema.safeParse(bad).success).toBe(false);
  });
});
