import "server-only";

import {
  dedupe,
  parseStatementCsv,
  type ProposedTransactions,
  type Transaction,
} from "@/lib/spending";
import type { InboxItem } from "@/lib/inbox";
import { getInboxItem, setInboxStatus } from "./inbox";
import { loadSpending } from "./spending";

/**
 * The **Extract → Propose** stage of the ingestion pipeline. Reads a `pending` CSV
 * inbox item, parses it into draft transactions (deterministic, no AI), dedupes them
 * against the spending ledger, and moves the item to `proposed` with the fresh drafts
 * stored on `extracted` for review. Nothing touches the live ledger here — that
 * happens only when the user approves the proposal (the Reconcile stage, next).
 *
 * Synchronous today (driven by a manual "Process" action); the same function will be
 * the body of a Vercel Cron `/api/inbox/process` runner that drains `pending` items.
 */
export async function processInboxItem(id: string): Promise<InboxItem> {
  const item = await getInboxItem(id); // ownership-checked

  // Only items at rest in pending (or a previous failure being retried) are eligible.
  if (item.status !== "pending" && item.status !== "failed") {
    return item;
  }

  // Only deterministic CSV extraction exists today; free text awaits the LLM stage.
  if (item.source !== "csv") {
    await setInboxStatus(id, "failed", {
      error: "Only CSV statements can be processed automatically for now.",
    });
    return getInboxItem(id);
  }

  const parsed = parseStatementCsv(item.raw);
  if (!parsed.mapping) {
    await setInboxStatus(id, "failed", {
      error:
        "Couldn't recognise the columns — a Date, a Description, and an Amount (or Paid out / Paid in) are needed.",
    });
    return getInboxItem(id);
  }
  if (parsed.drafts.length === 0) {
    await setInboxStatus(id, "failed", {
      error: "No transactions found in that file.",
    });
    return getInboxItem(id);
  }

  // Promote drafts to full transactions: assign ids and import provenance back to
  // this item, so the review screen can insert them and trace them to their source.
  const candidates: Transaction[] = parsed.drafts.map((d) => ({
    ...d,
    id: crypto.randomUUID(),
    source: { kind: "import", inboxItemId: id },
  }));

  // Dedupe against what's already in the ledger (and against each other).
  const existing = (await loadSpending())?.transactions ?? [];
  const { fresh, duplicates } = dedupe(existing, candidates);

  const extracted: ProposedTransactions = {
    transactions: fresh,
    duplicateCount: duplicates.length,
    skipped: parsed.skipped,
    totalRows: parsed.totalRows,
  };

  await setInboxStatus(id, "proposed", { extracted, error: null });
  return getInboxItem(id);
}
