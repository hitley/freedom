import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  annualBudget,
  monthlyBudget,
  reconcileWindow,
  type RecurringExpense,
  type SpendingCategory,
  type ReconcileView,
  type Transaction,
} from "@/lib/spending";

// A pure-domain spec: the budget + reconciliation helpers run directly, no infra.
const feature = await loadFeature("features/spending/recurring-budget.feature");

interface ExpenseRow {
  payee: string;
  category: string;
  estimate: string;
  freq: string;
  interval?: string;
  active?: string;
}

function expenseFromRow(r: ExpenseRow): RecurringExpense {
  return {
    id: crypto.randomUUID(),
    payee: r.payee,
    category: r.category as SpendingCategory,
    direction: "out",
    estimate: Number(r.estimate),
    basis: "fixed",
    active: r.active ? r.active === "true" : true,
    recurrence: {
      freq: r.freq as "once" | "weekly" | "monthly",
      startDate: "2026-01-01",
      dayOfMonth: 1,
      interval: r.interval ? Number(r.interval) : undefined,
    },
  };
}

describeFeature(feature, ({ Scenario }) => {
  let recurring: RecurringExpense[];
  let transactions: Transaction[];
  let view: ReconcileView;

  Scenario("Each commitment normalises to a monthly-equivalent cost", ({ Given, Then, And }) => {
    Given("the recurring expenses:", (_, rows: ExpenseRow[]) => {
      recurring = rows.map(expenseFromRow);
    });
    Then("the monthly budget is {number}", (_, expected: number) => {
      expect(monthlyBudget(recurring)).toBeCloseTo(expected, 2);
    });
    And("the annual budget is {number}", (_, expected: number) => {
      expect(annualBudget(recurring)).toBeCloseTo(expected, 2);
    });
  });

  Scenario("Inactive commitments are left out of the budget", ({ Given, Then }) => {
    Given("the recurring expenses:", (_, rows: ExpenseRow[]) => {
      recurring = rows.map(expenseFromRow);
    });
    Then("the monthly budget is {number}", (_, expected: number) => {
      expect(monthlyBudget(recurring)).toBeCloseTo(expected, 2);
    });
  });

  Scenario("A linked actual reconciles its occurrence and reports variance", ({ Given, And, When, Then }) => {
    Given("a recurring {string} expense of {number} due monthly on day {number}", (_, payee: string, estimate: number, day: number) => {
      recurring = [{
        id: "exp-1",
        payee,
        category: "housing",
        direction: "out",
        estimate,
        basis: "fixed",
        active: true,
        recurrence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: day },
      }];
      transactions = [];
    });
    And("a {string} payment of {number} on {string} linked to that occurrence", (_, desc: string, amount: number, date: string) => {
      transactions = [{
        id: "tx-1",
        date,
        description: desc,
        amount,
        direction: "out",
        category: "housing",
        source: { kind: "manual" },
        recurring: { expenseId: "exp-1", dueDate: date },
      }];
    });
    When("I reconcile the window {string} to {string} as of {string}", (_, from: string, to: string, asOf: string) => {
      view = reconcileWindow({ transactions, recurring }, d(from), d(to), d(asOf));
    });
    Then("the occurrence on {string} is {string}", (_, date: string, status: string) => {
      expect(occ(view, date).status).toBe(status);
    });
    And("its variance is {number}", (_, expected: number) => {
      expect(occ(view, "2026-01-01").variance).toBeCloseTo(expected, 2);
    });
  });

  Scenario("A passed occurrence with no payment is overdue", ({ Given, When, Then, And }) => {
    Given("a recurring {string} expense of {number} due monthly on day {number}", (_, payee: string, estimate: number, day: number) => {
      recurring = [{
        id: "exp-1",
        payee,
        category: "housing",
        direction: "out",
        estimate,
        basis: "fixed",
        active: true,
        recurrence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: day },
      }];
      transactions = [];
    });
    When("I reconcile the window {string} to {string} as of {string}", (_, from: string, to: string, asOf: string) => {
      view = reconcileWindow({ transactions, recurring }, d(from), d(to), d(asOf));
    });
    Then("the occurrence on {string} is {string}", (_, date: string, status: string) => {
      expect(occ(view, date).status).toBe(status);
    });
    And("the occurrence on {string} is {string}", (_, date: string, status: string) => {
      expect(occ(view, date).status).toBe(status);
    });
  });
});

/** Parse a `YYYY-MM-DD` to a local-midnight Date (matching the engine's convention). */
function d(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
}

/** Find the reconciled occurrence falling on a given date. */
function occ(view: ReconcileView, date: string) {
  const found = view.occurrences.find((o) => o.dueDate === date);
  if (!found) throw new Error(`no occurrence on ${date}`);
  return found;
}
