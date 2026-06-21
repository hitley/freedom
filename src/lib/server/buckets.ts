import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bucketsStates } from "@/db/schema";
import { bucketsStateSchema, type BucketsState } from "@/lib/buckets";
import { getDefaultInstance, getOrCreateDefaultInstance } from "./instance";

/**
 * Data access layer for an instance's buckets state. Stored as a single jsonb
 * document, validated through `bucketsStateSchema` on the way in *and* out.
 */

/** The default instance's buckets state, or `null` if none saved yet. */
export async function loadBuckets(): Promise<BucketsState | null> {
  const instance = await getDefaultInstance();
  if (!instance) return null;

  const row = await db.query.bucketsStates.findFirst({
    where: eq(bucketsStates.instanceId, instance.id),
  });
  if (!row) return null;

  return bucketsStateSchema.parse(row.data);
}

/** Upsert the default instance's buckets state, provisioning on first save. */
export async function saveBuckets(input: unknown): Promise<void> {
  const data = bucketsStateSchema.parse(input);
  const instance = await getOrCreateDefaultInstance();
  const updatedAt = new Date();

  await db
    .insert(bucketsStates)
    .values({ instanceId: instance.id, data, updatedAt })
    .onConflictDoUpdate({
      target: bucketsStates.instanceId,
      set: { data, updatedAt },
    });
}
