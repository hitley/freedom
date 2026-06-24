import "server-only";

import { z } from "zod";
import {
  dedupe,
  proposedTransactionsSchema,
  transactionSchema,
  type SpendingState,
  type Transaction,
} from "@/lib/spending";
import type { InboxItem } from "@/lib/inbox";
import { getInboxItem, setInboxStatus } from "./inbox";
import { loadSpending, saveSpending } from "./spending";

/**
 * The **Reconcile** stage — the only point where a proposal touches the live ledger,
 * and only on the user's say-so. Given the subset of a `proposed` item's drafts the
 * user approved (categories possibly edited, some dropped), validate they really came
 * from this item, append the genuinely-new ones to the spending ledger, and flip the
 * item to `applied`. Re-deduping on the way in keeps it idempotent — approving twice,
 * or against a ledger that changed since extraction, can't double-count.
 *
 * Returns both the updated item and the new spending state so the client can reflect
 * the ledger immediately without a refetch.
 */
export async function reconcileInboxItem(
  id: string,
  approved: unknown,
): Promise<{ item: InboxItem; spending: SpendingState }> {
  const item = await getInboxItem(id); // ownership-checked

  // Only a proposal can be reconciled; anything else is a no-op (return as-is).
  if (item.status !== "proposed") {
    return { item, spending: (await loadSpending()) ?? { transactions: [] } };
  }

  const txns = z.array(transactionSchema).parse(approved) as Transaction[];

  // Trust boundary: every approved row must be one of *this* item's proposed drafts.
  // The client may edit a draft's category, but can't smuggle in foreign transactions.
  const proposed = proposedTransactionsSchema.parse(item.extracted);
  const proposedIds = new Set(proposed.transactions.map((t) => t.id));
  for (const t of txns) {
    if (t.source.kind !== "import" || t.source.inboxItemId !== id) {
      throw new Error("Approved a transaction not from this import.");
    }
    if (!proposedIds.has(t.id)) {
      throw new Error("Approved a transaction that wasn't proposed.");
    }
  }

  // Append the genuinely-new rows to the ledger (defensive dedupe vs current state).
  const current = (await loadSpending())?.transactions ?? [];
  const { fresh } = dedupe(current, txns);
  const spending: SpendingState = { transactions: [...current, ...fresh] };
  await saveSpending(spending);

  // Record exactly what was applied on the item, for provenance, then mark it applied.
  await setInboxStatus(id, "applied", {
    extracted: { ...proposed, transactions: txns },
    error: null,
  });

  return { item: await getInboxItem(id), spending };
}
