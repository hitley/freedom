import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financialProfiles } from "@/db/schema";
import { financialInputsSchema, type FinancialInputs } from "@/lib/finance";
import { getDefaultInstance, getOrCreateDefaultInstance } from "./instance";

/**
 * Data access layer for an instance's financial profile (the engine inputs).
 * Auth/authorization is enforced via the instance helpers; values cross the zod
 * boundary on the way in *and* out so a malformed or stale row fails loudly.
 */

/**
 * The default instance's engine inputs, or `null` if nothing is saved yet (no
 * instance, or no profile row) — the UI then falls back to its starter defaults.
 */
export async function loadFinancialProfile(): Promise<FinancialInputs | null> {
  const instance = await getDefaultInstance();
  if (!instance) return null;

  const row = await db.query.financialProfiles.findFirst({
    where: eq(financialProfiles.instanceId, instance.id),
  });
  if (!row) return null;

  return financialInputsSchema.parse({
    currentInvested: row.currentInvested,
    monthlyContribution: row.monthlyContribution,
    annualSpend: row.annualSpend,
    realReturnPct: row.realReturnPct,
    withdrawalRatePct: row.withdrawalRatePct,
    ongoingAnnualIncome: row.ongoingAnnualIncome ?? undefined,
    currentAge: row.currentAge ?? undefined,
  });
}

/**
 * Upsert the default instance's engine inputs. Validates untrusted input at the
 * boundary, lazily provisioning the instance on first save.
 */
export async function saveFinancialProfile(input: unknown): Promise<void> {
  const inputs = financialInputsSchema.parse(input);
  const instance = await getOrCreateDefaultInstance();

  const values = {
    instanceId: instance.id,
    currentInvested: inputs.currentInvested,
    monthlyContribution: inputs.monthlyContribution,
    annualSpend: inputs.annualSpend,
    realReturnPct: inputs.realReturnPct,
    withdrawalRatePct: inputs.withdrawalRatePct,
    ongoingAnnualIncome: inputs.ongoingAnnualIncome ?? 0,
    currentAge: inputs.currentAge ?? null,
    updatedAt: new Date(),
  };

  await db
    .insert(financialProfiles)
    .values(values)
    .onConflictDoUpdate({ target: financialProfiles.instanceId, set: values });
}
