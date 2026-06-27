import { describe, expect, it } from "vitest";
import {
  annualBudget,
  annualisedSpend,
  budgetByCategory,
  cadenceLabel,
  budgetSummary,
  dedupe,
  dedupeKey,
  dueOccurrences,
  isIncome,
  isSpend,
  monthlyBudget,
  monthlyEquivalent,
  normaliseDescription,
  reconcileWindow,
  recurringExpenseSchema,
  suggestMatches,
  spendByCategory,
  spendByMonth,
  spendingStateSchema,
  spendWindow,
  summarise,
  type RecurringExpense,
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
  recurring: [],
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

  it("defaults `recurring` to empty for documents stored before it existed", () => {
    const parsed = spendingStateSchema.parse({ transactions: [groceries] });
    expect(parsed.recurring).toEqual([]);
  });

  it("round-trips the recurring budget through the persistence boundary", () => {
    // The DAL parses through this schema on both read and write, so a populated
    // budget must survive the trip back out unchanged (the whole jsonb document).
    const withBudget: SpendingState = {
      transactions: [groceries],
      recurring: [
        {
          id: "rent",
          payee: "Rent",
          category: "housing",
          direction: "out",
          estimate: 1_350,
          basis: "fixed",
          active: true,
          recurrence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: 1 },
        },
      ],
    };
    const out = spendingStateSchema.parse(
      JSON.parse(JSON.stringify(withBudget)),
    ) as SpendingState;
    expect(out).toEqual(withBudget);
  });
});

/* -------------------------------------------------------------------------- */

/** Terse builder for a recurring expense. */
function expense(
  partial: Partial<RecurringExpense> & Pick<RecurringExpense, "id">,
): RecurringExpense {
  return {
    payee: "Bill",
    category: "utilities",
    direction: "out",
    estimate: 100,
    basis: "fixed",
    active: true,
    recurrence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: 1 },
    ...partial,
  };
}

describe("monthlyEquivalent", () => {
  it("is the estimate itself for a plain monthly commitment", () => {
    expect(monthlyEquivalent(expense({ id: "m", estimate: 120 }))).toBeCloseTo(120, 6);
  });

  it("divides an annual commitment across twelve months", () => {
    const annual = expense({
      id: "a",
      estimate: 420,
      recurrence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: 1, interval: 12 },
    });
    expect(monthlyEquivalent(annual)).toBeCloseTo(35, 6);
  });

  it("treats a quarterly commitment as a third of its estimate per month", () => {
    const quarterly = expense({
      id: "q",
      estimate: 165,
      recurrence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: 1, interval: 3 },
    });
    expect(monthlyEquivalent(quarterly)).toBeCloseTo(55, 6);
  });

  it("scales a weekly commitment by 52/12", () => {
    const weekly = expense({
      id: "w",
      estimate: 30,
      recurrence: { freq: "weekly", startDate: "2026-01-05", weekday: 1 },
    });
    expect(monthlyEquivalent(weekly)).toBeCloseTo((30 * 52) / 12, 6);
  });

  it("counts a true one-off as nothing in the steady budget", () => {
    const once = expense({
      id: "o",
      recurrence: { freq: "once", startDate: "2026-03-01" },
    });
    expect(monthlyEquivalent(once)).toBe(0);
  });
});

describe("cadenceLabel", () => {
  it("names the common cadences from freq + interval", () => {
    const r = (freq: "once" | "weekly" | "monthly", interval?: number) =>
      cadenceLabel({ freq, startDate: "2026-01-01", interval });
    expect(r("monthly", 1)).toBe("Monthly");
    expect(r("monthly", 3)).toBe("Quarterly");
    expect(r("monthly", 6)).toBe("Half-yearly");
    expect(r("monthly", 12)).toBe("Yearly");
    expect(r("monthly", 5)).toBe("Every 5 months");
    expect(r("weekly", 1)).toBe("Weekly");
    expect(r("weekly", 2)).toBe("Fortnightly");
    expect(r("weekly", 3)).toBe("Every 3 weeks");
    expect(r("once")).toBe("One-off");
  });
});

describe("budget rollups", () => {
  const recurring = [
    expense({ id: "rent", category: "housing", estimate: 1_350 }),
    expense({ id: "water", category: "utilities", estimate: 165, recurrence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: 1, interval: 3 } }),
    expense({ id: "carservice", category: "transport", estimate: 420, recurrence: { freq: "monthly", startDate: "2026-09-01", dayOfMonth: 1, interval: 12 } }),
    expense({ id: "old", category: "subscriptions", estimate: 99, active: false }),
  ];

  it("sums only active commitments into the monthly budget", () => {
    // 1350 + 55 + 35 = 1440; the inactive 99 is excluded.
    expect(monthlyBudget(recurring)).toBeCloseTo(1_440, 6);
  });

  it("annualises the monthly budget", () => {
    expect(annualBudget(recurring)).toBeCloseTo(1_440 * 12, 6);
  });

  it("groups the budget by category, descending", () => {
    const byCat = budgetByCategory(recurring);
    expect(byCat[0]).toEqual({ category: "housing", amount: 1_350 });
    expect(byCat.find((c) => c.category === "utilities")?.amount).toBeCloseTo(55, 6);
    expect(byCat.find((c) => c.category === "transport")?.amount).toBeCloseTo(35, 6);
  });

  it("rolls everything into a budget summary", () => {
    const s = budgetSummary(recurring);
    expect(s.monthly).toBeCloseTo(1_440, 6);
    expect(s.annual).toBeCloseTo(1_440 * 12, 6);
    expect(s.byCategory).toHaveLength(3);
  });
});

describe("dueOccurrences", () => {
  it("expands commitments across a window, sorted by date, honouring cadence", () => {
    const recurring = [
      expense({ id: "rent", payee: "Rent", estimate: 1_350, recurrence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: 1 } }),
      expense({ id: "qtr", payee: "Water", estimate: 165, recurrence: { freq: "monthly", startDate: "2026-01-15", dayOfMonth: 15, interval: 3 } }),
    ];
    const due = dueOccurrences(recurring, new Date(2026, 0, 1), new Date(2026, 2, 31));
    // Rent on 1 Jan/Feb/Mar (3), water on 15 Jan only within Q (next is 15 Apr).
    expect(due.map((d) => d.dueDate)).toEqual([
      "2026-01-01",
      "2026-01-15",
      "2026-02-01",
      "2026-03-01",
    ]);
  });

  it("includes an occurrence landing exactly on the window's lower bound", () => {
    const recurring = [expense({ id: "rent", recurrence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: 1 } })];
    const due = dueOccurrences(recurring, new Date(2026, 0, 1), new Date(2026, 0, 1));
    expect(due).toHaveLength(1);
    expect(due[0].dueDate).toBe("2026-01-01");
  });

  it("skips inactive commitments", () => {
    const recurring = [expense({ id: "old", active: false })];
    expect(dueOccurrences(recurring, new Date(2026, 0, 1), new Date(2026, 11, 31))).toEqual([]);
  });
});

describe("reconcileWindow", () => {
  const recurring = [
    expense({ id: "rent", payee: "Rent", category: "housing", estimate: 1_350, recurrence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: 1 } }),
  ];

  it("matches a linked actual, reporting variance", () => {
    const paid = tx({
      id: "p",
      date: "2026-01-01",
      amount: 1_375,
      category: "housing",
      recurring: { expenseId: "rent", dueDate: "2026-01-01" },
    });
    const view = reconcileWindow(
      { transactions: [paid], recurring },
      new Date(2026, 0, 1),
      new Date(2026, 0, 31),
      new Date(2026, 0, 15),
    );
    expect(view.occurrences).toHaveLength(1);
    expect(view.occurrences[0].status).toBe("matched");
    expect(view.occurrences[0].variance).toBeCloseTo(25, 6);
    expect(view.unmatchedActuals).toHaveLength(0);
  });

  it("flags a past unmatched occurrence as overdue and a future one as due", () => {
    const view = reconcileWindow(
      { transactions: [], recurring },
      new Date(2026, 0, 1),
      new Date(2026, 2, 31),
      new Date(2026, 1, 15), // 15 Feb — Jan & Feb due dates have passed, Mar hasn't
    );
    const byDate = Object.fromEntries(view.occurrences.map((o) => [o.dueDate, o.status]));
    expect(byDate["2026-01-01"]).toBe("overdue");
    expect(byDate["2026-02-01"]).toBe("overdue");
    expect(byDate["2026-03-01"]).toBe("due");
    expect(view.occurrences.every((o) => o.variance === null)).toBe(true);
  });

  it("surfaces spend with no commitment as an unmatched actual", () => {
    const groceriesTx = tx({ id: "gr", date: "2026-01-10", amount: 80, category: "groceries" });
    const view = reconcileWindow(
      { transactions: [groceriesTx], recurring: [] },
      new Date(2026, 0, 1),
      new Date(2026, 0, 31),
      new Date(2026, 0, 31),
    );
    expect(view.unmatchedActuals.map((t) => t.id)).toEqual(["gr"]);
  });
});

describe("suggestMatches", () => {
  const rent = expense({
    id: "rent",
    payee: "Rent",
    category: "housing",
    estimate: 1_350,
    basis: "fixed",
  });

  it("suggests a near-date, near-amount, same-category spend", () => {
    const txns = [
      tx({ id: "hit", date: "2026-01-02", amount: 1_350, category: "housing" }),
      tx({ id: "wrongcat", date: "2026-01-01", amount: 1_350, category: "groceries" }),
      tx({ id: "fardate", date: "2026-01-20", amount: 1_350, category: "housing" }),
      tx({ id: "in", date: "2026-01-01", amount: 1_350, category: "housing", direction: "in" }),
    ];
    const matches = suggestMatches(rent, "2026-01-01", txns);
    expect(matches.map((m) => m.transaction.id)).toEqual(["hit"]);
    expect(matches[0].dayDelta).toBe(1);
    expect(matches[0].amountDelta).toBe(0);
  });

  it("rejects amounts outside the tight band for a fixed commitment", () => {
    const txns = [tx({ id: "over", date: "2026-01-01", amount: 1_600, category: "housing" })];
    expect(suggestMatches(rent, "2026-01-01", txns)).toHaveLength(0);
  });

  it("allows a wide amount swing for an estimated commitment", () => {
    const energy = expense({
      id: "energy",
      category: "utilities",
      estimate: 100,
      basis: "estimated",
    });
    const txns = [tx({ id: "spiky", date: "2026-01-01", amount: 130, category: "utilities" })];
    const matches = suggestMatches(energy, "2026-01-01", txns);
    expect(matches.map((m) => m.transaction.id)).toEqual(["spiky"]);
    expect(matches[0].amountDelta).toBe(30);
  });

  it("matches on a narrative hint even when the category differs", () => {
    const gym = expense({
      id: "gym",
      category: "health",
      estimate: 40,
      basis: "fixed",
      match: { descriptions: ["PureGym"] },
    });
    const txns = [tx({ id: "g", date: "2026-01-01", amount: 40, description: "PUREGYM LTD", category: "shopping" })];
    expect(suggestMatches(gym, "2026-01-01", txns).map((m) => m.transaction.id)).toEqual(["g"]);
  });

  it("never suggests an already-linked transaction", () => {
    const txns = [
      tx({
        id: "linked",
        date: "2026-01-01",
        amount: 1_350,
        category: "housing",
        recurring: { expenseId: "rent", dueDate: "2025-12-01" },
      }),
    ];
    expect(suggestMatches(rent, "2026-01-01", txns)).toHaveLength(0);
  });

  it("ranks the closest fit first", () => {
    const txns = [
      tx({ id: "far", date: "2026-01-04", amount: 1_360, category: "housing" }),
      tx({ id: "near", date: "2026-01-01", amount: 1_350, category: "housing" }),
    ];
    expect(suggestMatches(rent, "2026-01-01", txns).map((m) => m.transaction.id)).toEqual([
      "near",
      "far",
    ]);
  });
});

describe("recurringExpenseSchema", () => {
  it("accepts a valid commitment", () => {
    expect(() => recurringExpenseSchema.parse(expense({ id: "ok" }))).not.toThrow();
  });

  it("rejects a non-out direction and an empty payee", () => {
    expect(() => recurringExpenseSchema.parse(expense({ id: "x", direction: "in" as never }))).toThrow();
    expect(() => recurringExpenseSchema.parse(expense({ id: "y", payee: "" }))).toThrow();
  });
});
