import { z } from "zod";
import { occurrences, parseISO, recurrenceSchema, startOfDay, toISO } from "@/lib/buckets";
import type { Recurrence } from "@/lib/buckets";
import type {
  BudgetSummary,
  CategoryBudget,
  CategorySpend,
  DueOccurrence,
  MonthSpend,
  ReconciledOccurrence,
  ReconcileView,
  RecurringExpense,
  SpendingState,
  SpendingSummary,
  SpendWindow,
  Transaction,
} from "./types";
import { SPENDING_CATEGORIES } from "./types";

export * from "./types";
export * from "./csv";

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
 * The expected side: a bottom-up budget of recurring expenses. Each commitment
 * normalises to a monthly-equivalent figure; summed, that's the stable "rough
 * monthly spend" — a steadier feed to the vision target than extrapolating a short
 * window of observed transactions. See design-notes/003.
 * ------------------------------------------------------------------------- */

/**
 * How many times a recurrence fires in a representative year, at steady state.
 * Deliberately analytic (12 ÷ interval for monthly, 52 ÷ interval for weekly) and
 * **bound-agnostic** — a monthly DD is a monthly DD regardless of when it started or
 * ends. A `once` expense is a genuine one-off, not part of the steady budget, so 0.
 */
function occurrencesPerYear(rec: Recurrence): number {
  const interval = Math.max(1, rec.interval ?? 1);
  switch (rec.freq) {
    case "weekly":
      return 52 / interval;
    case "monthly":
      return 12 / interval;
    case "once":
    default:
      return 0;
  }
}

/** A single commitment's monthly-equivalent cost: estimate × times-per-year ÷ 12. */
export function monthlyEquivalent(expense: RecurringExpense): number {
  return (expense.estimate * occurrencesPerYear(expense.recurrence)) / 12;
}

/** Active, money-out commitments — the lines that make up the live budget. */
function activeBudgetLines(recurring: RecurringExpense[]): RecurringExpense[] {
  return recurring.filter((e) => e.active && e.direction === "out");
}

/** Sum of every active commitment's monthly-equivalent estimate, in GBP. */
export function monthlyBudget(recurring: RecurringExpense[]): number {
  return activeBudgetLines(recurring).reduce(
    (sum, e) => sum + monthlyEquivalent(e),
    0,
  );
}

/** The stable, forward-looking annual budget (`monthlyBudget × 12`), in GBP. */
export function annualBudget(recurring: RecurringExpense[]): number {
  return monthlyBudget(recurring) * 12;
}

/** Monthly-equivalent budget grouped by category, descending by amount. */
export function budgetByCategory(recurring: RecurringExpense[]): CategoryBudget[] {
  const byCat = new Map<RecurringExpense["category"], number>();
  for (const e of activeBudgetLines(recurring)) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + monthlyEquivalent(e));
  }
  return [...byCat.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** The budget rollup: headline monthly/annual figures + the by-category breakdown. */
export function budgetSummary(recurring: RecurringExpense[]): BudgetSummary {
  const monthly = monthlyBudget(recurring);
  return {
    monthly,
    annual: monthly * 12,
    byCategory: budgetByCategory(recurring),
  };
}

/**
 * Every expected occurrence falling within `[from, to]`, sorted by date. Expands
 * each active commitment's recurrence via the buckets engine (honouring its own
 * start/end bounds), so this is the "due this month" / upcoming list. The window is
 * inclusive of both ends — the engine treats its lower bound as exclusive, so we
 * step back a day to include an occurrence landing exactly on `from`.
 */
export function dueOccurrences(
  recurring: RecurringExpense[],
  from: Date,
  to: Date,
): DueOccurrence[] {
  const afterExclusive = new Date(startOfDay(from).getTime() - 1);
  const until = startOfDay(to);
  const out: DueOccurrence[] = [];
  for (const e of activeBudgetLines(recurring)) {
    for (const date of occurrences(e.recurrence, afterExclusive, until)) {
      out.push({
        expenseId: e.id,
        payee: e.payee,
        category: e.category,
        dueDate: toISO(date),
        estimate: e.estimate,
      });
    }
  }
  return out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}

/**
 * The reconciliation reading over `[from, to]`: every expected occurrence paired
 * with the actual that settled it (via a confirmed `transaction.recurring` link),
 * or marked `overdue`/`due` by its date against `asOf`. Also returns **unmatched
 * actuals** — spend in the window with no commitment behind it (discretionary or a
 * missed commitment). Matching here is by *confirmed link only* — fuzzy
 * suggest-a-match is a later layer; this view trusts what the user has stamped.
 */
export function reconcileWindow(
  state: SpendingState,
  from: Date,
  to: Date,
  asOf: Date,
): ReconcileView {
  const asOfISO = toISO(startOfDay(asOf));
  // Index linked actuals by "expenseId|dueDate" so each occurrence finds its match.
  const linked = new Map<string, Transaction>();
  for (const tx of state.transactions) {
    if (tx.recurring) {
      linked.set(`${tx.recurring.expenseId}|${tx.recurring.dueDate}`, tx);
    }
  }
  const due = dueOccurrences(state.recurring, from, to);
  const reconciled: ReconciledOccurrence[] = due.map((occ) => {
    const actual = linked.get(`${occ.expenseId}|${occ.dueDate}`) ?? null;
    const status: ReconciledOccurrence["status"] = actual
      ? "matched"
      : occ.dueDate <= asOfISO
        ? "overdue"
        : "due";
    return {
      ...occ,
      status,
      actual,
      variance: actual ? actual.amount - occ.estimate : null,
    };
  });

  const fromISO = toISO(startOfDay(from));
  const toISODate = toISO(startOfDay(to));
  const unmatchedActuals = state.transactions.filter(
    (tx) =>
      isSpend(tx) &&
      !tx.recurring &&
      tx.date >= fromISO &&
      tx.date <= toISODate,
  );

  return { occurrences: reconciled, unmatchedActuals };
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

const CATEGORY = z.enum(
  SPENDING_CATEGORIES.map((c) => c.id) as [string, ...string[]],
);

export const recurringLinkSchema = z.object({
  expenseId: z.string().min(1),
  dueDate: ISO_DATE,
});

export const transactionSchema = z.object({
  id: z.string().min(1),
  date: ISO_DATE,
  description: z.string().trim().min(1).max(200),
  amount: MONEY,
  direction: z.enum(["in", "out"]),
  category: CATEGORY,
  source: transactionSourceSchema,
  recurring: recurringLinkSchema.optional(),
});

export const recurringExpenseSchema = z.object({
  id: z.string().min(1),
  payee: z.string().trim().min(1).max(120),
  category: CATEGORY,
  direction: z.literal("out"),
  estimate: MONEY,
  basis: z.enum(["fixed", "estimated"]),
  recurrence: recurrenceSchema,
  match: z
    .object({ descriptions: z.array(z.string().trim().min(1)).optional() })
    .optional(),
  active: z.boolean(),
  notes: z.string().trim().max(500).optional(),
});

export const spendingStateSchema = z.object({
  transactions: z.array(transactionSchema),
  // Older stored documents predate recurring expenses — default so they parse.
  recurring: z.array(recurringExpenseSchema).default([]),
});

export type SpendingStateInput = z.input<typeof spendingStateSchema>;

/**
 * The Extract stage's output, stored on an inbox item's `extracted` field once it's
 * `proposed`: the fresh (deduped) transactions awaiting review, plus the counts that
 * explain what happened to the rest of the file. Full `Transaction`s — ids and import
 * provenance already assigned — so the review screen only has to confirm and insert.
 */
export const proposedTransactionsSchema = z.object({
  transactions: z.array(transactionSchema),
  /** Rows dropped because they already exist in the spending ledger. */
  duplicateCount: z.number().int().min(0),
  /** Rows the parser couldn't read (bad date/amount, summary lines). */
  skipped: z.number().int().min(0),
  /** Total data rows the parser saw. */
  totalRows: z.number().int().min(0),
});

export type ProposedTransactions = {
  transactions: Transaction[];
  duplicateCount: number;
  skipped: number;
  totalRows: number;
};
