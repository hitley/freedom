import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import type { InboxItem, InboxStatus } from "@/lib/inbox";
import type { ProposedTransactions, SpendingCategory, Transaction } from "@/lib/spending";

// Swap the DB-backed DAL for the in-memory fake so the *real* pipeline code runs
// against a fake world. Both mocks resolve to the same shared `store` instance.
vi.mock("@/lib/server/inbox", async () => (await import("../support/dal-fake")).inboxFake);
vi.mock("@/lib/server/spending", async () => (await import("../support/dal-fake")).spendingFake);

const { store } = await import("../support/dal-fake");
const { processInboxItem } = await import("@/lib/server/extract");

const feature = await loadFeature("features/ingestion/extract.feature");

/** Build a captured inbox item the way Capture would have left it. */
function captured(id: string, source: InboxItem["source"], raw: string, status: InboxStatus = "pending"): InboxItem {
  return {
    id,
    instanceId: "inst",
    source,
    label: `${id}.${source}`,
    raw,
    status,
    extracted: null,
    error: null,
    createdAt: new Date(),
    processedAt: null,
  };
}

/** A ledger row, as if previously reconciled in. */
function ledgerSpend(description: string, amount: number, date: string): Transaction {
  return {
    id: crypto.randomUUID(),
    date,
    description,
    amount,
    direction: "out",
    category: "groceries" as SpendingCategory,
    source: { kind: "manual" },
  };
}

const proposal = (item: InboxItem) => item.extracted as ProposedTransactions;

describeFeature(feature, ({ Background, Scenario }) => {
  let result: InboxItem;

  Background(({ Given }) => {
    Given("an empty spending ledger", () => {
      store.reset();
      store.spending = { transactions: [], recurring: [] };
    });
  });

  Scenario("A clean statement becomes a proposal ready for review", ({ Given, When, Then, And }) => {
    Given("a pending CSV inbox item {string} containing:", (_, id: string, csv: string) => {
      store.seedItem(captured(id, "csv", csv));
    });
    When("the item is processed", async () => {
      result = await processInboxItem("stmt-1");
    });
    Then("the item status is {string}", (_, status: string) => {
      expect(result.status).toBe(status);
    });
    And("{number} transactions are proposed", (_, n: number) => {
      expect(proposal(result).transactions).toHaveLength(n);
    });
    And("the live spending ledger is still empty", () => {
      expect(store.spending?.transactions ?? []).toHaveLength(0);
    });
    And("every proposed transaction is traceable back to item {string}", (_, id: string) => {
      for (const tx of proposal(result).transactions) {
        expect(tx.source).toEqual({ kind: "import", inboxItemId: id });
      }
    });
  });

  Scenario("A row already in the ledger is recognised as a duplicate, not re-proposed", ({ Given, When, Then, And }) => {
    Given("the ledger already contains a {string} spend of {number} on {string}", (_, desc: string, amount: number, date: string) => {
      store.spending = { transactions: [ledgerSpend(desc, amount, date)], recurring: [] };
    });
    And("a pending CSV inbox item {string} containing:", (_, id: string, csv: string) => {
      store.seedItem(captured(id, "csv", csv));
    });
    When("the item is processed", async () => {
      result = await processInboxItem("stmt-2");
    });
    Then("the item status is {string}", (_, status: string) => {
      expect(result.status).toBe(status);
    });
    And("{number} transaction is proposed", (_, n: number) => {
      expect(proposal(result).transactions).toHaveLength(n);
    });
    And("the proposal reports {number} duplicate", (_, n: number) => {
      expect(proposal(result).duplicateCount).toBe(n);
    });
  });

  Scenario("A file with unrecognisable columns fails with a helpful reason", ({ Given, When, Then, And }) => {
    Given("a pending CSV inbox item {string} containing:", (_, id: string, csv: string) => {
      store.seedItem(captured(id, "csv", csv));
    });
    When("the item is processed", async () => {
      result = await processInboxItem("stmt-3");
    });
    Then("the item status is {string}", (_, status: string) => {
      expect(result.status).toBe(status);
    });
    And("the failure reason mentions the columns it needs", () => {
      expect(result.error?.toLowerCase()).toContain("column");
    });
  });

  Scenario("Free-text notes can't be auto-extracted yet", ({ Given, When, Then }) => {
    Given("a pending TEXT inbox item {string} containing:", (_, id: string, text: string) => {
      store.seedItem(captured(id, "text", text));
    });
    When("the item is processed", async () => {
      result = await processInboxItem("note-1");
    });
    Then("the item status is {string}", (_, status: string) => {
      expect(result.status).toBe(status);
    });
  });

  Scenario("An already-proposed item is left untouched when processed again", ({ Given, When, Then }) => {
    Given("a proposed inbox item {string}", (_, id: string) => {
      store.seedItem(captured(id, "csv", "Date,Description,Amount\n2026-01-05,Tesco,-1.00", "proposed"));
    });
    When("the item is processed", async () => {
      result = await processInboxItem("stmt-4");
    });
    Then("the item status is {string}", (_, status: string) => {
      expect(result.status).toBe(status);
    });
  });
});
