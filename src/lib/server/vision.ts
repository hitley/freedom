import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { visionStates } from "@/db/schema";
import { freedomVisionSchema, type FreedomVision } from "@/lib/vision";
import { getDefaultInstance, getOrCreateDefaultInstance } from "./instance";

/**
 * Data access layer for an instance's captured vision. Stored as a single
 * jsonb document, validated through `freedomVisionSchema` on the way in *and*
 * out so a malformed or stale row fails loudly.
 */

/** The default instance's vision, or `null` if none saved yet. */
export async function loadVision(): Promise<FreedomVision | null> {
  const instance = await getDefaultInstance();
  if (!instance) return null;

  const row = await db.query.visionStates.findFirst({
    where: eq(visionStates.instanceId, instance.id),
  });
  if (!row) return null;

  return freedomVisionSchema.parse(row.data);
}

/** Upsert the default instance's vision, provisioning the instance on first save. */
export async function saveVision(input: unknown): Promise<void> {
  const data = freedomVisionSchema.parse(input);
  const instance = await getOrCreateDefaultInstance();
  const updatedAt = new Date();

  await db
    .insert(visionStates)
    .values({ instanceId: instance.id, data, updatedAt })
    .onConflictDoUpdate({
      target: visionStates.instanceId,
      set: { data, updatedAt },
    });
}
