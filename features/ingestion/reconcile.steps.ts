import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import type { InboxItem } from "@/lib/inbox";
import {
  summarise,
  type Direction,
  type ProposedTransactions,
  type SpendingCategory,
  type Transaction,
} from "@/lib/spending";

vi.mock("@/lib/server/inbox", async () => (await import("../support/dal-fake")).inboxFake);
vi.mock("@/lib/server/spending", async () => (await import("../support/dal-fake")).spendingFake);

const { store } = await import("../support/dal-fake");
const { reconcileInboxItem } = await import("@/lib/server/reconcile");

const feature = await loadFeature("features/ingestion/reconcile.feature");

interface OfferRow {
  id: string;
  description: string;
  amount: string;
  direction: string;
  category: string;
}

describeFeature(feature, ({ Background, Scenario }) => {
  let offered: Transaction[]; // the proposal's drafts, the only legitimate inputs
  let rejected: boolean;

  /** Pick approved rows out of the proposal by id, applying optional edits. */
  function approve(ids: string[], edit: (tx: Transaction) => Transaction = (t) => t): Transaction[] {
    return ids.map((id) => {
      const draft = offered.find((t) => t.id === id);
      if (!draft) throw new Error(`test set-up: no offered row "${id}"`);
      return edit({ ...draft });
    });
  }

  async function reconcile(approved: Transaction[], itemId = "stmt-1") {
    rejected = false;
    try {
      await reconcileInboxItem(itemId, approved);
    } catch {
      rejected = true;
    }
  }

  const ledger = () => store.spending?.transactions ?? [];
  const totalSpend = () => summarise({ transactions: ledger() }).totalOut;

  Background(({ Given, And }) => {
    Given("an empty spending ledger", () => {
      store.reset();
      store.spending = { transactions: [] };
      rejected = false;
    });
    And("a proposed inbox item {string} offering:", (_, id: string, rows: OfferRow[]) => {
      offered = rows.map((r) => ({
        id: r.id,
        date: "2026-01-05",
        description: r.description,
        amount: Number(r.amount),
        direction: r.direction as Direction,
        category: r.category as SpendingCategory,
        source: { kind: "import", inboxItemId: id },
      }));
      const extracted: ProposedTransactions = {
        transactions: offered,
        duplicateCount: 0,
        skipped: 0,
        totalRows: offered.length,
      };
      const item: InboxItem = {
        id,
        instanceId: "inst",
        source: "csv",
        label: `${id}.csv`,
        raw: "(captured statement)",
        status: "proposed",
        extracted,
        error: null,
        createdAt: new Date(),
        processedAt: new Date(),
      };
      store.seedItem(item);
    });
  });

  Scenario("Approving the whole proposal adds every row and marks it applied", ({ When, Then, And }) => {
    When("the user approves rows {string} from item {string}", async (_, ids: string) => {
      await reconcile(approve(ids.split(",").map((s) => s.trim())));
    });
    Then("the item status is {string}", (_, status: string) => {
      expect(store.item("stmt-1").status).toBe(status);
    });
    And("the spending ledger contains {number} transactions", (_, n: number) => {
      expect(ledger()).toHaveLength(n);
    });
    And("the ledger total spend is {number}", (_, amount: number) => {
      expect(totalSpend()).toBeCloseTo(amount, 2);
    });
  });

  Scenario("Dropping a row during review keeps it out of the ledger", ({ When, Then, And }) => {
    When("the user approves rows {string} from item {string}", async (_, ids: string) => {
      await reconcile(approve(ids.split(",").map((s) => s.trim())));
    });
    Then("the item status is {string}", (_, status: string) => {
      expect(store.item("stmt-1").status).toBe(status);
    });
    And("the spending ledger contains {number} transaction", (_, n: number) => {
      expect(ledger()).toHaveLength(n);
    });
    And("the ledger total spend is {number}", (_, amount: number) => {
      expect(totalSpend()).toBeCloseTo(amount, 2);
    });
  });

  Scenario("Re-categorising a row during review is honoured", ({ When, Then, And }) => {
    When("the user approves row {string} from item {string} re-categorised as {string}", async (_, id: string, _item: string, category: string) => {
      await reconcile(approve([id], (tx) => ({ ...tx, category: category as SpendingCategory })));
    });
    Then("the spending ledger contains {number} transaction", (_, n: number) => {
      expect(ledger()).toHaveLength(n);
    });
    And("the ledger transaction {string} has category {string}", (_, description: string, category: string) => {
      expect(ledger().find((t) => t.description === description)?.category).toBe(category);
    });
  });

  Scenario("A row that wasn't part of this proposal is rejected", ({ When, Then, And }) => {
    When("the user approves a transaction {string} that item {string} never proposed", async (_, id: string, itemId: string) => {
      const foreign: Transaction = {
        id,
        date: "2026-01-05",
        description: "Sneaky",
        amount: 999,
        direction: "out",
        category: "other",
        source: { kind: "import", inboxItemId: itemId },
      };
      await reconcile([foreign], itemId);
    });
    Then("reconciliation is rejected", () => {
      expect(rejected).toBe(true);
    });
    And("the spending ledger is still empty", () => {
      expect(ledger()).toHaveLength(0);
    });
  });

  Scenario("A row smuggled in from another import is rejected", ({ When, Then, And }) => {
    When("the user approves row {string} but re-tagged as imported from item {string}", async (_, id: string, otherItem: string) => {
      await reconcile(approve([id], (tx) => ({ ...tx, source: { kind: "import", inboxItemId: otherItem } })));
    });
    Then("reconciliation is rejected", () => {
      expect(rejected).toBe(true);
    });
    And("the spending ledger is still empty", () => {
      expect(ledger()).toHaveLength(0);
    });
  });

  Scenario("Reconciling the same proposal twice doesn't double-count", ({ When, Then, And }) => {
    When("the user approves rows {string} from item {string}", async (_, ids: string) => {
      await reconcile(approve(ids.split(",").map((s) => s.trim())));
    });
    And("the user approves rows {string} from item {string} again", async (_, ids: string) => {
      await reconcile(approve(ids.split(",").map((s) => s.trim())));
    });
    Then("the spending ledger contains {number} transactions", (_, n: number) => {
      expect(ledger()).toHaveLength(n);
    });
  });
});
