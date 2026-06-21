"use server";

import { saveFinancialProfile } from "@/lib/server/financial-profile";
import type { FinancialInputsInput } from "@/lib/finance";

/**
 * Thin `"use server"` boundary over the data access layer. Auth, authorization,
 * and validation all live in the DAL (`@/lib/server/*`); this just delegates so
 * the action stays a minimal, dead-code-eliminable entry point.
 */
export async function saveFinancialProfileAction(
  inputs: FinancialInputsInput,
): Promise<{ ok: true }> {
  await saveFinancialProfile(inputs);
  return { ok: true };
}
