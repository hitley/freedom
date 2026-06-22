import { describe, expect, it } from "vitest";
import {
  annualisedSpend,
  dedupe,
  dedupeKey,
  isIncome,
  isSpend,
  normaliseDescription,
  spendByCategory,
  spendByMonth,
  spendingStateSchema,
  spendWindow,
  summarise,
  type SpendingState,
  type Transaction,
} from "./index";

/** Terse builder so each test reads as the case it exercises, not boilerplate. */
function tx(partial: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    date: "2026-01-01",
    description: "Test",
    amount: 10,
    direction: "out",
    category: "groceries",
    source: { kind: "manual" },
    ...partial,
  };
}

const groceries = tx({ id: "g", amount: 100, date: "2026-01-10", category: "groceries" });
const dining = tx({ id: "d", amount: 40, date: "2026-01-20", category: "dining" });
const salary = tx({
  id: "s",
  amount: 3_000,
  date: "2026-01-25",
  direction: "in",
  category: "income",
});
const transferOut = tx({
  id: "t",
  amount: 500,
  date: "2026-01-15",
  direction: "out",
  category: "transfer",
});

const state: SpendingState = {
  transactions: [groceries, dining, salary, transferOut],
};

describe("isSpend / isIncome", () => {
  it("counts out, non-transfer as spend", () => {
    expect(isSpend(groceries)).toBe(true);
    expect(isSpend(salary)).toBe(false); // money in
    expect(isSpend(transferOut)).toBe(false); // own-account move
  });

  it("counts in, non-transfer as income", () => {
    expect(isIncome(salary)).toBe(true);
    expect(isIncome(groceries)).toBe(false);
    expect(isIncome({ ...transferOut, direction: "in" })).toBe(false);
  });
});

describe("summarise", () => {
  it("totals spend and income, excluding transfers", () => {
    const s = summarise(state);
    expect(s.totalOut).toBe(140); // 100 + 40, not the 500 transfer
    expect(s.totalIn).toBe(3_000);
    expect(s.net).toBe(2_860);
    expect(s.count).toBe(4);
  });
});

describe("spendByCategory", () => {
  it("groups spend by category, descending, ignoring income and transfers", () => {
    const rows = spendByCategory(state.transactions);
    expect(rows).toEqual([
      { category: "groceries", amount: 100 },
      { category: "dining", amount: 40 },
    ]);
  });
});

describe("spendByMonth", () => {
  it("splits out and in by calendar month, oldest-first", () => {
    const multi: Transaction[] = [
      tx({ id: "a", amount: 30, date: "2026-02-01" }),
      groceries, // 2026-01
      salary, // 2026-01 in
    ];
    expect(spendByMonth(multi)).toEqual([
      { month: "2026-01", out: 100, in: 3_000 },
      { month: "2026-02", out: 30, in: 0 },
    ]);
  });
});

describe("spendWindow / annualisedSpend", () => {
  it("is empty with no spend", () => {
    const w = spendWindow([salary]);
    expect(w).toEqual({ total: 0, fromDate: null, toDate: null, days: 0, annualised: 0 });
  });

  it("scales the observed window to a 365-day year", () => {
    // 140 spent across an inclusive 11-day window (Jan 10 → Jan 20).
    const w = spendWindow(state.transactions);
    expect(w.total).toBe(140);
    expect(w.fromDate).toBe("2026-01-10");
    expect(w.toDate).toBe("2026-01-20");
    expect(w.days).toBe(11);
    expect(w.annualised).toBeCloseTo((140 / 11) * 365, 5);
    expect(annualisedSpend(state.transactions)).toBeCloseTo(w.annualised, 5);
  });

  it("treats a single-day window as one inclusive day", () => {
    const w = spendWindow([groceries]);
    expect(w.days).toBe(1);
    expect(w.annualised).toBeCloseTo(100 * 365, 5);
  });
});

describe("normaliseDescription", () => {
  it("lower-cases, strips punctuation, collapses whitespace", () => {
    expect(normaliseDescription("  TESCO   STORES-1234  ")).toBe("tesco stores 1234");
    expect(normaliseDescription("Café & Bar!!")).toBe("caf bar");
  });
});

describe("dedupeKey / dedupe", () => {
  it("keys the same real transaction equal regardless of id and provenance", () => {
    const a = tx({ id: "1", source: { kind: "manual" } });
    const b = tx({ id: "2", source: { kind: "import", inboxItemId: "x" } });
    expect(dedupeKey(a)).toBe(dedupeKey(b));
  });

  it("keys an in/out pair of equal magnitude differently (a refund)", () => {
    const out = tx({ id: "1", direction: "out" });
    const refund = tx({ id: "2", direction: "in" });
    expect(dedupeKey(out)).not.toBe(dedupeKey(refund));
  });

  it("separates fresh rows from ones already present", () => {
    const existing = [groceries];
    const incoming = [
      tx({ id: "dup", amount: 100, date: "2026-01-10", category: "groceries" }), // same as groceries
      dining,
    ];
    const { fresh, duplicates } = dedupe(existing, incoming);
    expect(fresh.map((t) => t.id)).toEqual(["d"]);
    expect(duplicates.map((t) => t.id)).toEqual(["dup"]);
  });

  it("dedupes incoming rows against each other too", () => {
    const incoming = [
      tx({ id: "a", amount: 12, date: "2026-03-01", description: "Coffee" }),
      tx({ id: "b", amount: 12, date: "2026-03-01", description: "Coffee" }),
    ];
    const { fresh, duplicates } = dedupe([], incoming);
    expect(fresh.map((t) => t.id)).toEqual(["a"]);
    expect(duplicates.map((t) => t.id)).toEqual(["b"]);
  });
});

describe("spendingStateSchema", () => {
  it("accepts valid state and round-trips both source kinds", () => {
    const parsed = spendingStateSchema.parse(state);
    expect(parsed.transactions).toHaveLength(4);
  });

  it("rejects a negative amount, a bad date, and an unknown category", () => {
    expect(() => spendingStateSchema.parse({ transactions: [{ ...groceries, amount: -1 }] })).toThrow();
    expect(() => spendingStateSchema.parse({ transactions: [{ ...groceries, date: "10/01/2026" }] })).toThrow();
    expect(() => spendingStateSchema.parse({ transactions: [{ ...groceries, category: "nope" }] })).toThrow();
  });

  it("rejects an import source missing its inboxItemId", () => {
    const bad = { ...groceries, source: { kind: "import" } };
    expect(() => spendingStateSchema.parse({ transactions: [bad] })).toThrow();
  });
});
