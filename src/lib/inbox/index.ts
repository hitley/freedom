import { z } from "zod";
import type { InboxItem, InboxStatus } from "./types";
import { TERMINAL_STATUSES } from "./types";

export * from "./types";

/* ----------------------------------------------------------------------------
 * Pure helpers. Given inbox items, derive what the UI shows. No I/O — the DAL
 * (`src/lib/server/inbox.ts`) owns persistence and authorization.
 * ------------------------------------------------------------------------- */

/** True when an item is still moving through the pipeline (not applied/dismissed). */
export function isActive(item: InboxItem): boolean {
  return !TERMINAL_STATUSES.includes(item.status);
}

/** True when an item has drafts waiting for the user to review. */
export function needsReview(item: InboxItem): boolean {
  return item.status === "proposed";
}

/** Newest-first by capture time — the order the inbox list reads in. */
export function sortByNewest(items: InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Count of items in each status, for badges/summaries. */
export function countByStatus(items: InboxItem[]): Record<InboxStatus, number> {
  const counts = {
    pending: 0,
    extracting: 0,
    proposed: 0,
    applied: 0,
    failed: 0,
    dismissed: 0,
  } satisfies Record<InboxStatus, number>;
  for (const item of items) counts[item.status]++;
  return counts;
}

/* ----------------------------------------------------------------------------
 * Validation at the trust boundary. The capture form (and, later, an upload
 * endpoint) cross this before anything is stored. `raw` is capped so a paste can't
 * balloon the row; the cap is generous enough for a multi-year statement export.
 * ------------------------------------------------------------------------- */

/** Max inline artifact size, in characters (~1MB of CSV/text). */
export const MAX_RAW_CHARS = 1_000_000;

export const inboxSourceSchema = z.enum(["csv", "text", "pdf", "image", "email"]);

export const inboxStatusSchema = z.enum([
  "pending",
  "extracting",
  "proposed",
  "applied",
  "failed",
  "dismissed",
]);

/** The boundary for capturing a new item — what a client is allowed to supply. */
export const newInboxItemSchema = z.object({
  // Only the sources we actually handle today may be captured.
  source: z.enum(["csv", "text"]),
  label: z.string().trim().min(1).max(120),
  raw: z.string().trim().min(1).max(MAX_RAW_CHARS),
});

export type NewInboxItemInput = z.input<typeof newInboxItemSchema>;
