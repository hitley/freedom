/**
 * An in-memory stand-in for the inbox + spending data-access layer, so the ingestion
 * behavioural specs can drive the *real* pipeline code (`extract.ts` / `reconcile.ts`)
 * without a Postgres. The functions mirror the DAL's signatures and the one behaviour
 * the pipeline depends on — `setInboxStatus` stamps `processedAt` whenever an item
 * leaves `pending`, exactly as `src/lib/server/inbox.ts` does.
 *
 * The steps wire these in with `vi.mock("@/lib/server/inbox", …)` /
 * `vi.mock("@/lib/server/spending", …)`. Ownership/auth checks live in the real DAL
 * and aren't re-tested here — these specs are about pipeline behaviour, not authz.
 */
import type { InboxItem, InboxStatus } from "@/lib/inbox";
import type { SpendingState } from "@/lib/spending";

/** Shared mutable world the fakes read and write; steps seed and inspect it. */
export const store = {
  items: new Map<string, InboxItem>(),
  spending: null as SpendingState | null,

  reset() {
    this.items.clear();
    this.spending = null;
  },
  seedItem(item: InboxItem) {
    this.items.set(item.id, item);
  },
  item(id: string): InboxItem {
    const found = this.items.get(id);
    if (!found) throw new Error(`No seeded inbox item "${id}"`);
    return found;
  },
};

/** Mock module for `@/lib/server/inbox` — only what the pipeline imports. */
export const inboxFake = {
  async getInboxItem(id: string): Promise<InboxItem> {
    return store.item(id);
  },
  async setInboxStatus(
    id: string,
    status: InboxStatus,
    patch: { extracted?: unknown; error?: string | null } = {},
  ): Promise<void> {
    const current = store.item(id);
    store.items.set(id, {
      ...current,
      status,
      processedAt: status === "pending" ? null : new Date(),
      ...(patch.extracted !== undefined ? { extracted: patch.extracted as InboxItem["extracted"] } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    });
  },
};

/** Mock module for `@/lib/server/spending` — the ledger load/save the pipeline uses. */
export const spendingFake = {
  async loadSpending(): Promise<SpendingState | null> {
    return store.spending;
  },
  async saveSpending(state: SpendingState): Promise<void> {
    store.spending = state;
  },
};
