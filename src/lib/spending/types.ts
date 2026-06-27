/**
 * Domain types for **spending** — the user's *observed* outgoings and income,
 * as opposed to the *intended* movements modelled by buckets' `Cashflow`s.
 *
 * This is where real transactions land: rows imported from a bank/current-account
 * statement (via the ingestion inbox) or hand-entered. The headline figure the rest
 * of the app cares about is **annualised spend** — a data-backed answer to "what does
 * a year of my life actually cost", which feeds the vision's target spend → magic
 * number → freedom date. Today that target is typed by hand; this domain makes it
 * something the numbers can corroborate.
 *
 * Everything here is plain data — no DB, no framework, no I/O — so the helpers in
 * `index.ts` stay pure and unit-testable. Persistence/validation at the edges.
 *
 * See `design-notes/001-ingestion-inbox-bookkeeper.md` for the pipeline this serves.
 */

import type { Recurrence } from "@/lib/buckets";

/** Which way money moved: `in` (a credit) or `out` (a debit/spend). */
export type Direction = "in" | "out";

/**
 * What a transaction was for. Drives grouping and what counts as *spend*:
 *  - `transfer` is money moving between the user's own accounts — never spend,
 *    never income (it would otherwise double-count).
 *  - `income` labels `in` transactions (salary, interest); it isn't a spend bucket.
 *  - everything else, on an `out` transaction, is spend.
 */
export type SpendingCategory =
  | "groceries"
  | "dining"
  | "transport"
  | "housing"
  | "utilities"
  | "health"
  | "entertainment"
  | "shopping"
  | "travel"
  | "subscriptions"
  | "income"
  | "transfer"
  | "other"
  | "uncategorised";

/**
 * Where a transaction came from — its provenance. An imported row keeps the id of
 * the inbox item it was extracted from, so a bad import can be traced back and
 * undone wholesale. Hand-entered rows are simply `manual`.
 */
export type TransactionSource =
  | { kind: "manual" }
  | { kind: "import"; inboxItemId: string };

/**
 * A confirmed reconciliation link: this observed transaction is the actual that
 * satisfied a specific expected occurrence of a {@link RecurringExpense}. The link
 * lives on the transaction (not a separate store) so it's auditable and undoable,
 * the same instinct as import provenance. Only stamped on user confirmation.
 */
export interface RecurringLink {
  /** The {@link RecurringExpense} this transaction settled. */
  expenseId: string;
  /** The expected occurrence's date (`YYYY-MM-DD`) this actual was matched to. */
  dueDate: string;
}

/** One observed movement of money — a single statement line or a manual entry. */
export interface Transaction {
  id: string;
  /** When it happened — a date-only ISO string (e.g. "2026-06-21"). */
  date: string;
  /** What it was, as it should read in a list (often the raw statement narrative). */
  description: string;
  /** Magnitude in GBP, always **positive**; `direction` carries the sign. */
  amount: number;
  direction: Direction;
  category: SpendingCategory;
  source: TransactionSource;
  /** Set once this actual is reconciled against an expected occurrence. */
  recurring?: RecurringLink;
}

/**
 * A transaction before it's been given an identity and provenance — what the CSV
 * parser produces. The Extract stage assigns an `id` and an `import` `source` to turn
 * each draft into a full {@link Transaction}.
 */
export type DraftTransaction = Omit<Transaction, "id" | "source">;

/**
 * A **recurring/expected expense** — the *intended* side of spending, the
 * counterpart to the observed {@link Transaction} ledger. A commitment with a
 * cadence and an estimate: monthly direct debits, quarterly water, the annual car
 * service. Summed and normalised to "per month", these form a stable, bottom-up
 * budget — a steadier feed to the vision's target spend than extrapolating a short
 * window of observed transactions.
 *
 * Deliberately a different aggregate root from buckets' `Cashflow` (which funds a
 * *purpose envelope*); this one forecasts *outgoings*. It reuses buckets' recurrence
 * engine for scheduling but stays its own concept — see
 * `design-notes/003-recurring-expenses-and-budget-reconciliation.md`.
 */
export interface RecurringExpense {
  id: string;
  /** Who's paid — "British Gas", "Audi servicing". */
  payee: string;
  category: SpendingCategory;
  /** Room for recurring income later; today every commitment is money `out`. */
  direction: "out";
  /** Expected amount per occurrence, in GBP. */
  estimate: number;
  /**
   * `fixed` is a known direct debit (matches actuals on a tight amount band);
   * `estimated` is an averaged guess from prior usage (wants a wide band).
   */
  basis: "fixed" | "estimated";
  /** When and how often it falls due — reused from buckets (`monthly-on-day`, annual, …). */
  recurrence: Recurrence;
  /** Narrative hints for auto-suggesting which actuals settle this commitment. */
  match?: { descriptions?: string[] };
  /** Inactive commitments are kept for history but excluded from the live budget. */
  active: boolean;
  notes?: string;
}

/** The full client-side state: observed transactions plus the expected-expense budget. */
export interface SpendingState {
  transactions: Transaction[];
  /** The bottom-up budget of expected/recurring expenses. */
  recurring: RecurringExpense[];
}

/** Spend within one calendar month, for the by-month breakdown. */
export interface MonthSpend {
  /** The month, as a `YYYY-MM` string. */
  month: string;
  /** Spend (out, excluding transfers) in the month, in GBP. */
  out: number;
  /** Income (in, excluding transfers) in the month, in GBP. */
  in: number;
}

/** Spend within one category, for the by-category breakdown. */
export interface CategorySpend {
  category: SpendingCategory;
  /** Total spend in this category over the window, in GBP. */
  amount: number;
}

/**
 * The observed-spend reading over the data's own window. `annualised` scales the
 * window up to a full year, so a few months of statements still answer "what would
 * a year cost" — caveat the obvious: short or sparse windows extrapolate noisily.
 */
export interface SpendWindow {
  /** Total spend over the observed window, in GBP. */
  total: number;
  /** Earliest spend date in the window, or null if there's no spend. */
  fromDate: string | null;
  /** Latest spend date in the window, or null if there's no spend. */
  toDate: string | null;
  /** Inclusive span of the window in days (≥ 1 when any spend exists, else 0). */
  days: number;
  /** `total` scaled to 365 days. */
  annualised: number;
}

/** Whole-state rollup for the summary header. */
export interface SpendingSummary {
  /** Total spend (out, excluding transfers), in GBP. */
  totalOut: number;
  /** Total income (in, excluding transfers), in GBP. */
  totalIn: number;
  /** `totalIn − totalOut`. */
  net: number;
  /** Number of transactions, all directions. */
  count: number;
  /** Spend broken down by category, descending by amount. */
  byCategory: CategorySpend[];
  /** Spend and income per calendar month, oldest-first. */
  byMonth: MonthSpend[];
  /** The annualised-spend reading over the observed window. */
  window: SpendWindow;
}

/** Monthly-equivalent budget within one category, for the budget breakdown. */
export interface CategoryBudget {
  category: SpendingCategory;
  /** Monthly-equivalent expected spend in this category, in GBP. */
  amount: number;
}

/** The bottom-up budget rollup: the headline monthly/annual figures + breakdown. */
export interface BudgetSummary {
  /** Sum of every active commitment's monthly-equivalent estimate, in GBP. */
  monthly: number;
  /** `monthly × 12` — the stable, forward-looking annual budget, in GBP. */
  annual: number;
  /** Monthly-equivalent budget by category, descending by amount. */
  byCategory: CategoryBudget[];
}

/** One expected occurrence of a recurring expense within a window. */
export interface DueOccurrence {
  expenseId: string;
  payee: string;
  category: SpendingCategory;
  /** The date this occurrence falls due (`YYYY-MM-DD`). */
  dueDate: string;
  /** Expected amount for this occurrence, in GBP. */
  estimate: number;
}

/**
 * Where an expected occurrence stands against reality:
 *  - `matched` — an actual transaction has been reconciled to it;
 *  - `overdue` — its due date has passed (≤ `asOf`) with no matched actual;
 *  - `due`     — still upcoming (> `asOf`), not yet settled.
 */
export type ReconcileStatus = "matched" | "overdue" | "due";

/** An expected occurrence paired with the actual that settled it (if any). */
export interface ReconciledOccurrence extends DueOccurrence {
  status: ReconcileStatus;
  /** The transaction reconciled to this occurrence, or null when unmatched. */
  actual: Transaction | null;
  /** `actual.amount − estimate` when matched, else null. Positive = over budget. */
  variance: number | null;
}

/**
 * The reconciliation reading over a window: each expected occurrence with its
 * matched actual (or overdue/due), plus **unmatched actuals** — real spend in the
 * window with no commitment behind it.
 */
export interface ReconcileView {
  occurrences: ReconciledOccurrence[];
  unmatchedActuals: Transaction[];
}

/**
 * A *suggested* (never auto-applied) actual transaction that could settle an expected
 * occurrence — surfaced for the user to confirm. Ranked by `score` (lower = better fit);
 * `dayDelta` / `amountDelta` explain the fit so the UI can show "2 days early, £3 over".
 */
export interface MatchCandidate {
  transaction: Transaction;
  /** Absolute whole-day gap between the actual's date and the expected due date. */
  dayDelta: number;
  /** `transaction.amount − estimate` (positive = paid more than expected). */
  amountDelta: number;
  /** Combined goodness-of-fit; smaller is a closer match. */
  score: number;
}

/**
 * Human labels for categories, for selects and chips. `spend: true` means an `out`
 * transaction in this category counts toward spend totals; `income`/`transfer` are
 * false because they must never be counted as spend. First entry is the default for
 * a freshly-imported, unclassified row.
 */
export const SPENDING_CATEGORIES: {
  id: SpendingCategory;
  label: string;
  glyph: string;
  spend: boolean;
}[] = [
  { id: "uncategorised", label: "Uncategorised", glyph: "❓", spend: true },
  { id: "groceries", label: "Groceries", glyph: "🛒", spend: true },
  { id: "dining", label: "Eating out", glyph: "🍽️", spend: true },
  { id: "transport", label: "Transport", glyph: "🚆", spend: true },
  { id: "housing", label: "Housing", glyph: "🏠", spend: true },
  { id: "utilities", label: "Utilities", glyph: "💡", spend: true },
  { id: "health", label: "Health", glyph: "🏥", spend: true },
  { id: "entertainment", label: "Entertainment", glyph: "🎬", spend: true },
  { id: "shopping", label: "Shopping", glyph: "🛍️", spend: true },
  { id: "travel", label: "Travel", glyph: "✈️", spend: true },
  { id: "subscriptions", label: "Subscriptions", glyph: "🔁", spend: true },
  { id: "other", label: "Other", glyph: "✨", spend: true },
  { id: "income", label: "Income", glyph: "💰", spend: false },
  { id: "transfer", label: "Transfer", glyph: "🔄", spend: false },
];
