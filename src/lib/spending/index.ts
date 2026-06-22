import { z } from "zod";
import { parseISO, startOfDay } from "@/lib/buckets";
import type {
  CategorySpend,
  MonthSpend,
  SpendingState,
  SpendingSummary,
  SpendWindow,
  Transaction,
} from "./types";
import { SPENDING_CATEGORIES } from "./types";

export * from "./types";

/* ----------------------------------------------------------------------------
 * Pure helpers. Given a flat list of transactions, derive what the UI shows and
 * what the projection cares about. No I/O, no React. "Spend" deliberately excludes
 * transfers (own-account moves) and income, so totals reflect real outgoings.
 * ------------------------------------------------------------------------- */

/** True when a transaction is real spend: money out, and not an own-account transfer. */
export function isSpend(tx: Transaction): boolean {
  return tx.direction === "out" && tx.category !== "transfer";
}

/** True when a transaction is real income: money in, and not an own-account transfer. */
export function isIncome(tx: Transaction): boolean {
  return tx.direction === "in" && tx.category !== "transfer";
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between two ISO dates, inclusive of both ends (≥ 1). */
function inclusiveDays(fromISO: string, toISO: string): number {
  const from = startOfDay(parseISO(fromISO)).getTime();
  const to = startOfDay(parseISO(toISO)).getTime();
  return Math.max(1, Math.round((to - from) / MS_PER_DAY) + 1);
}

/**
 * The observed-spend reading over the transactions' own date window. Sums every
 * spend transaction, measures the inclusive span from the first to the last, and
 * scales that total to a full 365-day year. With no spend at all the window is
 * empty (zeros, null dates). Short windows extrapolate noisily by nature — that's
 * a presentation caveat, not something this helper second-guesses.
 */
export function spendWindow(transactions: Transaction[]): SpendWindow {
  const spend = transactions.filter(isSpend);
  if (spend.length === 0) {
    return { total: 0, fromDate: null, toDate: null, days: 0, annualised: 0 };
  }
  let total = 0;
  let fromDate = spend[0].date;
  let toDate = spend[0].date;
  for (const tx of spend) {
    total += tx.amount;
    if (tx.date < fromDate) fromDate = tx.date;
    if (tx.date > toDate) toDate = tx.date;
  }
  const days = inclusiveDays(fromDate, toDate);
  return { total, fromDate, toDate, days, annualised: (total / days) * 365 };
}

/** Spend scaled to a full year, from the observed window. Convenience over `spendWindow`. */
export function annualisedSpend(transactions: Transaction[]): number {
  return spendWindow(transactions).annualised;
}

/** Spend grouped by category, descending by amount. Only spend transactions count. */
export function spendByCategory(transactions: Transaction[]): CategorySpend[] {
  const byCat = new Map<Transaction["category"], number>();
  for (const tx of transactions) {
    if (!isSpend(tx)) continue;
    byCat.set(tx.category, (byCat.get(tx.category) ?? 0) + tx.amount);
  }
  return [...byCat.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Spend and income grouped by calendar month (`YYYY-MM`), oldest-first. */
export function spendByMonth(transactions: Transaction[]): MonthSpend[] {
  const byMonth = new Map<string, MonthSpend>();
  for (const tx of transactions) {
    const month = tx.date.slice(0, 7);
    const row = byMonth.get(month) ?? { month, out: 0, in: 0 };
    if (isSpend(tx)) row.out += tx.amount;
    else if (isIncome(tx)) row.in += tx.amount;
    byMonth.set(month, row);
  }
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

/** Whole-state rollup for the summary header. */
export function summarise(state: SpendingState): SpendingSummary {
  let totalOut = 0;
  let totalIn = 0;
  for (const tx of state.transactions) {
    if (isSpend(tx)) totalOut += tx.amount;
    else if (isIncome(tx)) totalIn += tx.amount;
  }
  return {
    totalOut,
    totalIn,
    net: totalIn - totalOut,
    count: state.transactions.length,
    byCategory: spendByCategory(state.transactions),
    byMonth: spendByMonth(state.transactions),
    window: spendWindow(state.transactions),
  };
}

/* ----------------------------------------------------------------------------
 * Dedupe. Importing an overlapping statement must not double-count a transaction.
 * A stable key over date + signed amount + a normalised description lets the
 * Propose stage drop rows already present. Description is normalised (lower-cased,
 * punctuation stripped, whitespace collapsed) so trivial narrative differences
 * between two exports of the same row don't defeat the match.
 * ------------------------------------------------------------------------- */

/** Lower-case, strip punctuation, collapse whitespace — for stable comparison. */
export function normaliseDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A stable dedupe key for a transaction: `date|signedAmount|normalisedDescription`.
 * The amount is signed by direction so an in/out pair of the same magnitude on the
 * same day (e.g. a refund) doesn't collapse together. Provenance and id are
 * deliberately excluded — the same real-world transaction from two imports keys equal.
 */
export function dedupeKey(tx: Transaction): string {
  const signed = tx.direction === "out" ? -tx.amount : tx.amount;
  return `${tx.date}|${signed.toFixed(2)}|${normaliseDescription(tx.description)}`;
}

/**
 * Split `candidates` into rows not already represented in `existing` (`fresh`) and
 * rows that collide with an existing transaction (`duplicates`). Used at the Propose
 * stage so an import only ever surfaces genuinely new transactions for review.
 */
export function dedupe(
  existing: Transaction[],
  candidates: Transaction[],
): { fresh: Transaction[]; duplicates: Transaction[] } {
  const seen = new Set(existing.map(dedupeKey));
  const fresh: Transaction[] = [];
  const duplicates: Transaction[] = [];
  for (const tx of candidates) {
    const key = dedupeKey(tx);
    if (seen.has(key)) {
      duplicates.push(tx);
    } else {
      seen.add(key); // also dedupe candidates against each other
      fresh.push(tx);
    }
  }
  return { fresh, duplicates };
}

/* ----------------------------------------------------------------------------
 * Validation at the trust boundary. Statement imports, the LLM extractor, and the
 * manual editor all pass transactions through here before they're stored or trusted
 * — the same rule as any user input. (Ready for persistence per instance, like the
 * other domains; the inbox/DAL wiring lands next.)
 * ------------------------------------------------------------------------- */

const MONEY = z.number().min(0).max(1e9);
const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date");

export const transactionSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }),
  z.object({ kind: z.literal("import"), inboxItemId: z.string().min(1) }),
]);

export const transactionSchema = z.object({
  id: z.string().min(1),
  date: ISO_DATE,
  description: z.string().trim().min(1).max(200),
  amount: MONEY,
  direction: z.enum(["in", "out"]),
  category: z.enum(
    SPENDING_CATEGORIES.map((c) => c.id) as [string, ...string[]],
  ),
  source: transactionSourceSchema,
});

export const spendingStateSchema = z.object({
  transactions: z.array(transactionSchema),
});

export type SpendingStateInput = z.input<typeof spendingStateSchema>;
