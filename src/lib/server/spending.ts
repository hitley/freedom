import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { spendingStates } from "@/db/schema";
import { spendingStateSchema, type SpendingState } from "@/lib/spending";
import { getDefaultInstance, getOrCreateDefaultInstance } from "./instance";

/**
 * Data access layer for an instance's spending state. Stored as a single jsonb
 * document, validated through `spendingStateSchema` in *and* out. This is the
 * persistence end of the ingestion pipeline: manual entries land here today, and
 * imported transactions will be reconciled into the same document later.
 */

/** The default instance's spending state, or `null` if none saved yet. */
export async function loadSpending(): Promise<SpendingState | null> {
  const instance = await getDefaultInstance();
  if (!instance) return null;

  const row = await db.query.spendingStates.findFirst({
    where: eq(spendingStates.instanceId, instance.id),
  });
  if (!row) return null;

  // `parse` validates at runtime (category/direction enums, source union), but the
  // schema widens enums to `string` at the type level, so assert the Component type.
  return spendingStateSchema.parse(row.data) as SpendingState;
}

/** Upsert the default instance's spending state, provisioning on first save. */
export async function saveSpending(input: unknown): Promise<void> {
  const data = spendingStateSchema.parse(input);
  const instance = await getOrCreateDefaultInstance();
  const updatedAt = new Date();

  await db
    .insert(spendingStates)
    .values({ instanceId: instance.id, data, updatedAt })
    .onConflictDoUpdate({
      target: spendingStates.instanceId,
      set: { data, updatedAt },
    });
}
