/**
 * Component types for financial **buckets** — a virtual layer of *purpose* over
 * the real accounts money actually lives in.
 *
 * The problem this solves: money gets consolidated into one account (e.g. a
 * mortgage offset) for a financial reason, and the mental separation of "what
 * is this money for" is lost. Buckets restore that separation without forcing
 * the money to move: you record each account's balance, then allocate slices of
 * it to buckets. A bucket can draw from several accounts, so the view is about
 * purpose, not location.
 *
 * Everything here is plain data — no DB, no framework, no I/O — so the helpers
 * in `index.ts` stay pure and unit-testable. Persistence/validation at the edges.
 */

/** Where money physically lives. `offset` is the mortgage-offset case that motivated this. */
export type AccountKind =
  | "offset"
  | "savings"
  | "current"
  | "investment"
  | "other";

/** A real place money sits, with the balance the user reports for it. */
export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  /** Total balance in this account today, in GBP. */
  balance: number;
  /**
   * Recurring movements into/out of this account that aren't tied to a bucket —
   * salary in, a direct-debit bill out, etc. Cross-component flows (an investment
   * contribution, a mortgage P&I payment) are *derived* from their source Component
   * and injected at projection time rather than stored here (see design-notes/006).
   */
  flows?: AccountFlow[];
  /** How this account automatically fills its buckets each period, if at all. */
  funding?: FundingPlan;
}

/**
 * A recurring movement of money into or out of an account, independent of any
 * bucket (salary, a bill). Reuses the same `Recurrence` engine as bucket cashflows.
 */
export interface AccountFlow {
  id: string;
  label: string;
  kind: FlowKind;
  /** Amount per occurrence, in GBP. */
  amount: number;
  recurrence: Recurrence;
}

/**
 * How an account's funding plan spreads money across *its* buckets:
 * - `target-date` — each dated bucket gets `remaining ÷ months-left` (bottom-up);
 * - `priority`    — fill buckets in order (their display order), overflow to the next;
 * - `even`        — split equally across buckets not yet at target.
 */
export type FundingStrategy = "target-date" | "priority" | "even";

/** An account-level rule that automatically fills its buckets each period. */
export interface FundingPlan {
  strategy: FundingStrategy;
  /** When the sweep happens. */
  cadence: Recurrence;
  /**
   * Fixed amount to sweep per occurrence, in GBP. Omit to sweep the account's
   * *computed surplus* (its unallocated balance) instead of a fixed figure.
   */
  amount?: number;
  /** Portion of the surplus to sweep (0–100) when `amount` is omitted. Default 100. */
  sharePct?: number;
}

/** A slice of one account assigned to a bucket. Bucket balance = sum of these. */
export interface Allocation {
  accountId: string;
  amount: number;
}

/** How often a scheduled payment repeats. */
export type RecurrenceFreq = "once" | "weekly" | "monthly";

/**
 * When a scheduled payment happens. Date fields are date-only ISO strings
 * (`YYYY-MM-DD`) — see `schedule.ts` for how these expand into actual dates.
 */
export interface Recurrence {
  freq: RecurrenceFreq;
  /** Start of the schedule. For `once`, this *is* the date it happens. */
  startDate: string;
  /** Inclusive last date a recurring schedule may fire (e.g. the holiday date). */
  endDate?: string;
  /** 0 (Sun) – 6 (Sat). Used by `weekly` (Friday = 5). */
  weekday?: number;
  /** 1 – 31, clamped to the month length. Used by `monthly` (e.g. the 20th). */
  dayOfMonth?: number;
  /** Repeat every N periods (default 1): weekly×2 = fortnightly, monthly×3 = quarterly. */
  interval?: number;
  /**
   * Stop after this many occurrences total (counted from `startDate`). An
   * alternative to `endDate` for capping a recurring schedule — e.g. 26
   * fortnightly buys. Unset = run until `endDate` (or forever). Ignored by `once`.
   */
  count?: number;
}

/** Direction of a scheduled payment: money into a bucket, or spent out of it. */
export type FlowKind = "in" | "out";

/** A scheduled movement of money for a bucket, flowing through a real account. */
export interface Cashflow {
  id: string;
  label: string;
  kind: FlowKind;
  /** Amount per occurrence, in GBP. Ignored when `drain` is true. */
  amount: number;
  /** `out` only: spend the entire bucket balance at the occurrence (a "blow the lot" spend). */
  drain?: boolean;
  /** Account the money flows through. Defaults to the bucket's main account when omitted. */
  accountId?: string;
  recurrence: Recurrence;
}

/** A purpose envelope. Its money may be spread across one or more accounts. */
export interface Bucket {
  id: string;
  name: string;
  /** Emoji used as the bucket's icon. */
  glyph: string;
  /** Optional goal amount, in GBP. */
  target?: number;
  /** Optional deadline for the goal — the "moment in time" a dated bucket aims for. */
  targetDate?: string;
  /**
   * The account this bucket is funded from — used by that account's `FundingPlan`
   * to decide which buckets it fills. When unset, falls back to the bucket's main
   * (largest-allocation) account, so existing buckets keep working.
   */
  sourceAccountId?: string;
  /** Slices of accounts that make up this bucket's balance today. */
  allocations: Allocation[];
  /** Recurring/one-off payments that move money in and out over time. */
  cashflows: Cashflow[];
}

/** The full client-side state: the accounts and the buckets carved from them. */
export interface BucketsState {
  accounts: Account[];
  buckets: Bucket[];
}

/** A bucket enriched with the today-snapshot figures the UI needs. */
export interface BucketView {
  /** Current balance — the sum of the bucket's allocations. */
  balance: number;
  /** Progress toward the target, 0–1, or null when no target is set. */
  fundedPct: number | null;
  /** Amount still needed to hit the target (0 if met or no target). */
  remaining: number;
  /** The accounts this bucket draws from (non-zero allocations). */
  accountIds: string[];
}

/** An account enriched with how much of it is spoken for. */
export interface AccountView {
  /** Sum of every bucket's allocations against this account. */
  allocated: number;
  /** balance − allocated. Negative is impossible; see `overAllocated`. */
  unallocated: number;
  /** True when buckets claim more than the account actually holds. */
  overAllocated: boolean;
}

/** Whole-state rollup for the summary header. */
export interface BucketsSummary {
  /** Sum of all account balances. */
  totalBalance: number;
  /** Sum of all bucket balances (money with a purpose). */
  totalAllocated: number;
  /** Money sitting in accounts with no purpose assigned — the "lost" money. */
  totalUnallocated: number;
  /** Buckets that have a target and have reached it. */
  bucketsFunded: number;
  /** Buckets that have a target. */
  bucketsWithTarget: number;
}

/** Human labels for account kinds, for selects and chips. */
export const ACCOUNT_KINDS: { id: AccountKind; label: string }[] = [
  { id: "offset", label: "Mortgage offset" },
  { id: "savings", label: "Savings" },
  { id: "current", label: "Current" },
  { id: "investment", label: "Investment" },
  { id: "other", label: "Other" },
];

/** Weekday labels, indexed 0 (Sun) – 6 (Sat) to match `Date.getDay()`. */
export const WEEKDAYS = [
  { id: 0, label: "Sun" },
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
] as const;

/** Suggested icons for the bucket glyph picker. First is the default. */
export const BUCKET_GLYPHS = [
  "🛟",
  "🏖️",
  "✨",
  "🏠",
  "🚗",
  "🎓",
  "🎁",
  "💍",
  "🏥",
  "🐾",
  "📈",
  "🌱",
] as const;
