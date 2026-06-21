"use server";

import { saveFinancialProfile } from "@/lib/server/financial-profile";
import { saveVision } from "@/lib/server/vision";
import { saveBuckets } from "@/lib/server/buckets";
import { saveInvestments } from "@/lib/server/investments";
import type { FinancialInputsInput } from "@/lib/finance";
import type { FreedomVisionInput } from "@/lib/vision";
import type { BucketsStateInput } from "@/lib/buckets";
import type { InvestmentsStateInput } from "@/lib/investments";

/**
 * Thin `"use server"` boundary over the data access layer. Auth, authorization,
 * and validation all live in the DAL (`@/lib/server/*`); these just delegate so
 * the actions stay minimal, dead-code-eliminable entry points.
 */

export async function saveFinancialProfileAction(
  inputs: FinancialInputsInput,
): Promise<{ ok: true }> {
  await saveFinancialProfile(inputs);
  return { ok: true };
}

export async function saveVisionAction(
  vision: FreedomVisionInput,
): Promise<{ ok: true }> {
  await saveVision(vision);
  return { ok: true };
}

export async function saveBucketsAction(
  buckets: BucketsStateInput,
): Promise<{ ok: true }> {
  await saveBuckets(buckets);
  return { ok: true };
}

export async function saveInvestmentsAction(
  investments: InvestmentsStateInput,
): Promise<{ ok: true }> {
  await saveInvestments(investments);
  return { ok: true };
}
