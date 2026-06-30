import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { inboxItems } from "@/db/schema";
import {
  newInboxItemSchema,
  type InboxItem,
  type InboxSource,
  type InboxStatus,
} from "@/lib/inbox";
import {
  getDefaultInstance,
  getOrCreateDefaultInstance,
  requireInstance,
} from "./instance";

/**
 * Data access layer for the ingestion inbox. Every read/write is scoped to an
 * instance the signed-in user owns (resolved server-side, never from a client id),
 * so there's no IDOR surface. Maps the loosely-typed DB row to the `InboxItem`
 * Component type on the way out.
 */

type InboxRow = typeof inboxItems.$inferSelect;

/** Narrow the DB row's text columns back to the Component's union types. */
function toItem(row: InboxRow): InboxItem {
  return {
    id: row.id,
    instanceId: row.instanceId,
    source: row.source as InboxSource,
    label: row.label,
    raw: row.raw,
    status: row.status as InboxStatus,
    extracted: row.extracted ?? null,
    error: row.error ?? null,
    createdAt: row.createdAt,
    processedAt: row.processedAt ?? null,
  };
}

/** The default instance's inbox items, newest-first. Empty if no instance yet. */
export async function listInbox(): Promise<InboxItem[]> {
  const instance = await getDefaultInstance();
  if (!instance) return [];

  const rows = await db
    .select()
    .from(inboxItems)
    .where(eq(inboxItems.instanceId, instance.id))
    .orderBy(desc(inboxItems.createdAt));
  return rows.map(toItem);
}

/**
 * Capture a new artifact into the inbox as a `pending` item, provisioning the
 * instance on first use. Validated through `newInboxItemSchema` (source allowlist +
 * size cap) before it touches the DB.
 */
export async function addInboxItem(input: unknown): Promise<InboxItem> {
  const data = newInboxItemSchema.parse(input);
  const instance = await getOrCreateDefaultInstance();

  const [row] = await db
    .insert(inboxItems)
    .values({
      instanceId: instance.id,
      source: data.source,
      label: data.label,
      raw: data.raw,
      status: "pending",
    })
    .returning();
  return toItem(row);
}

/** One inbox item, after confirming the signed-in user owns its instance. */
export async function getInboxItem(id: string): Promise<InboxItem> {
  const row = await db.query.inboxItems.findFirst({
    where: eq(inboxItems.id, id),
  });
  if (!row) throw new Error("Not found");
  // Ownership choke-point — resolves the instance from the row, checks the session.
  await requireInstance(row.instanceId);
  return toItem(row);
}

/**
 * Move an item to a new status (e.g. dismiss it, or — later — a processor claiming
 * or completing it). Ownership-checked, and scoped to the resolved instance in the
 * `WHERE` so a mismatched id can never update another instance's row. `processedAt`
 * is stamped whenever the item leaves `pending`.
 */
export async function setInboxStatus(
  id: string,
  status: InboxStatus,
  patch: { extracted?: unknown; error?: string | null } = {},
): Promise<void> {
  const item = await getInboxItem(id); // throws unless owned

  await db
    .update(inboxItems)
    .set({
      status,
      processedAt: status === "pending" ? null : new Date(),
      ...(patch.extracted !== undefined ? { extracted: patch.extracted } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    })
    .where(
      and(eq(inboxItems.id, id), eq(inboxItems.instanceId, item.instanceId)),
    );
}
