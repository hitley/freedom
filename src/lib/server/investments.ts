import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { investmentsStates } from "@/db/schema";
import { investmentsStateSchema, type InvestmentsState } from "@/lib/investments";
import { getDefaultInstance, getOrCreateDefaultInstance } from "./instance";

/**
 * Data access layer for an instance's investments state. Stored as a single
 * jsonb document, validated through `investmentsStateSchema` in *and* out.
 */

/** The default instance's investments state, or `null` if none saved yet. */
export async function loadInvestments(): Promise<InvestmentsState | null> {
  const instance = await getDefaultInstance();
  if (!instance) return null;

  const row = await db.query.investmentsStates.findFirst({
    where: eq(investmentsStates.instanceId, instance.id),
  });
  if (!row) return null;

  // `parse` validates the data at runtime (incl. the DRP frequency enum), but the
  // schema's enum widens to `string` at the type level, so assert the domain type.
  return investmentsStateSchema.parse(row.data) as InvestmentsState;
}

/** Upsert the default instance's investments state, provisioning on first save. */
export async function saveInvestments(input: unknown): Promise<void> {
  const data = investmentsStateSchema.parse(input);
  const instance = await getOrCreateDefaultInstance();
  const updatedAt = new Date();

  await db
    .insert(investmentsStates)
    .values({ instanceId: instance.id, data, updatedAt })
    .onConflictDoUpdate({
      target: investmentsStates.instanceId,
      set: { data, updatedAt },
    });
}
