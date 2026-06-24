import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  annualisedSpend,
  dedupe,
  summarise,
  type Direction,
  type SpendingCategory,
  type Transaction,
} from "@/lib/spending";

// A pure-domain spec: no DB, no server, no mocks — it exercises the spending
// helpers directly. This is the cheap, infra-free shape most behavioural specs
// should take; the ingestion specs only reach for a fake DAL because the pipeline
// is server-side. See design-notes/002-bdd-testing-and-living-docs.md.
const feature = await loadFeature("features/spending/annualised-spend.feature");

interface TxRow {
  date: string;
  description: string;
  amount: string;
  direction: string;
  category: string;
}

function row(r: TxRow): Transaction {
  return {
    id: crypto.randomUUID(),
    date: r.date,
    description: r.description,
    amount: Number(r.amount),
    direction: r.direction as Direction,
    category: r.category as SpendingCategory,
    source: { kind: "manual" },
  };
}

function spend(amount: number, description: string, date: string, direction: Direction = "out"): Transaction {
  return {
    id: crypto.randomUUID(),
    date,
    description,
    amount,
    direction,
    category: "shopping",
    source: { kind: "manual" },
  };
}

describeFeature(feature, ({ Scenario }) => {
  let transactions: Transaction[];
  let ledger: Transaction[];
  let incoming: Transaction[];
  let deduped: ReturnType<typeof dedupe>;

  Scenario("Annualised spend scales the observed window to a full year", ({ Given, Then }) => {
    Given("the transactions:", (_, rows: TxRow[]) => {
      transactions = rows.map(row);
    });
    Then("the annualised spend is {number}", (_, expected: number) => {
      expect(annualisedSpend(transactions)).toBeCloseTo(expected, 2);
    });
  });

  Scenario("Transfers between my own accounts are never spend", ({ Given, Then }) => {
    Given("the transactions:", (_, rows: TxRow[]) => {
      transactions = rows.map(row);
    });
    Then("the total spend is {number}", (_, expected: number) => {
      expect(summarise({ transactions }).totalOut).toBeCloseTo(expected, 2);
    });
  });

  Scenario("Income is never counted as spend", ({ Given, Then, And }) => {
    Given("the transactions:", (_, rows: TxRow[]) => {
      transactions = rows.map(row);
    });
    Then("the total spend is {number}", (_, expected: number) => {
      expect(summarise({ transactions }).totalOut).toBeCloseTo(expected, 2);
    });
    And("the total income is {number}", (_, expected: number) => {
      expect(summarise({ transactions }).totalIn).toBeCloseTo(expected, 2);
    });
  });

  Scenario("A refund is not mistaken for a duplicate of the matching spend", ({ Given, And, When, Then }) => {
    Given("an existing spend of {number} described {string} on {string}", (_, amount: number, desc: string, date: string) => {
      ledger = [spend(amount, desc, date, "out")];
    });
    And("an incoming refund of {number} described {string} on {string}", (_, amount: number, desc: string, date: string) => {
      incoming = [spend(amount, desc, date, "in")];
    });
    When("the incoming batch is deduped against the ledger", () => {
      deduped = dedupe(ledger, incoming);
    });
    Then("{number} transaction is treated as new", (_, n: number) => {
      expect(deduped.fresh).toHaveLength(n);
    });
    And("{number} transactions are treated as duplicates", (_, n: number) => {
      expect(deduped.duplicates).toHaveLength(n);
    });
  });
});
