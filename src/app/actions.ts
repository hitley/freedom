"use server";

import { revalidatePath } from "next/cache";
import { saveFinancialProfile } from "@/lib/server/financial-profile";
import { saveVision } from "@/lib/server/vision";
import { saveBuckets } from "@/lib/server/buckets";
import { saveInvestments } from "@/lib/server/investments";
import { saveSpending } from "@/lib/server/spending";
import { addInboxItem, setInboxStatus } from "@/lib/server/inbox";
import type { FinancialInputsInput } from "@/lib/finance";
import type { FreedomVisionInput } from "@/lib/vision";
import type { BucketsStateInput } from "@/lib/buckets";
import type { InvestmentsStateInput } from "@/lib/investments";
import type { SpendingStateInput } from "@/lib/spending";
import type { InboxItem, NewInboxItemInput } from "@/lib/inbox";

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

export async function saveSpendingAction(
  spending: SpendingStateInput,
): Promise<{ ok: true }> {
  await saveSpending(spending);
  return { ok: true };
}

/**
 * Capture an artifact into the ingestion inbox. Returns the created item so the
 * client can show it immediately; `revalidatePath` refreshes the server-rendered
 * list too.
 */
export async function addInboxItemAction(
  input: NewInboxItemInput,
): Promise<InboxItem> {
  const item = await addInboxItem(input);
  revalidatePath("/");
  return item;
}

/** Dismiss an inbox item (soft — kept for provenance, never applied). */
export async function dismissInboxItemAction(id: string): Promise<{ ok: true }> {
  await setInboxStatus(id, "dismissed");
  revalidatePath("/");
  return { ok: true };
}
