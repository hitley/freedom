import { z } from "zod";
import type {
  Account,
  AccountView,
  Bucket,
  BucketsState,
  BucketsSummary,
  BucketView,
} from "./types";
import { occurrences, startOfDay, addMonths } from "./schedule";

export * from "./types";
export * from "./schedule";

/* ----------------------------------------------------------------------------
 * Pure helpers. No I/O, no React — given state, derive what the UI shows.
 * ------------------------------------------------------------------------- */

/** A bucket's current balance: the sum of its allocation slices. */
export function bucketBalance(bucket: Bucket): number {
  return bucket.allocations.reduce((sum, a) => sum + a.amount, 0);
}

/** The today snapshot for a bucket: balance, funded %, remaining, and sources. */
export function bucketView(bucket: Bucket): BucketView {
  const balance = bucketBalance(bucket);
  const target = bucket.target;

  const remaining = target ? Math.max(0, target - balance) : 0;
  const fundedPct = target && target > 0 ? Math.min(1, balance / target) : null;

  const accountIds = bucket.allocations
    .filter((a) => a.amount !== 0)
    .map((a) => a.accountId);

  return { balance, fundedPct, remaining, accountIds };
}

/** The account a bucket's flows default to: its largest allocation, else its first. */
export function mainAccountId(bucket: Bucket): string | undefined {
  let best: { accountId: string; amount: number } | undefined;
  for (const a of bucket.allocations) {
    if (!best || a.amount > best.amount) best = a;
  }
  return best?.accountId ?? bucket.allocations[0]?.accountId;
}

/** How much of an account is claimed by buckets, and what's left over. */
export function accountView(
  account: Account,
  buckets: Bucket[],
): AccountView {
  const allocated = buckets.reduce(
    (sum, b) =>
      sum +
      b.allocations
        .filter((a) => a.accountId === account.id)
        .reduce((s, a) => s + a.amount, 0),
    0,
  );
  return {
    allocated,
    unallocated: account.balance - allocated,
    overAllocated: allocated > account.balance,
  };
}

/** Whole-state rollup for the summary header. */
export function summarise(state: BucketsState): BucketsSummary {
  const totalBalance = state.accounts.reduce((s, a) => s + a.balance, 0);
  const totalAllocated = state.buckets.reduce(
    (s, b) => s + bucketBalance(b),
    0,
  );
  const withTarget = state.buckets.filter((b) => b.target && b.target > 0);
  const funded = withTarget.filter((b) => bucketBalance(b) >= (b.target ?? 0));

  return {
    totalBalance,
    totalAllocated,
    totalUnallocated: totalBalance - totalAllocated,
    bucketsFunded: funded.length,
    bucketsWithTarget: withTarget.length,
  };
}

/* ----------------------------------------------------------------------------
 * Look-ahead. Replay every scheduled cashflow forward from today to derive how
 * buckets and accounts evolve over time. Order matters — a `drain` spend takes
 * whatever the bucket holds *at that moment* — so events are applied strictly in
 * chronological order.
 * ------------------------------------------------------------------------- */

/** A balance path over time: `dates[i]` carries `buckets[id][i]` / `accounts[id][i]`. */
export interface Timeline {
  dates: Date[];
  /** Projected balance per bucket id, aligned to `dates`. */
  buckets: Record<string, number[]>;
  /** Projected balance + unallocated per account id, aligned to `dates`. */
  accounts: Record<string, { balance: number; unallocated: number }[]>;
  /** True if any bucket dips below £0 at any point (a spend it can't cover). */
  anyShortfall: boolean;
}

interface DueEvent {
  date: Date;
  bucketId: string;
  accountId: string | undefined;
  kind: "in" | "out";
  amount: number;
  drain: boolean;
}

/**
 * Project buckets + accounts from `from` to `to`. Snapshots are taken on a
 * monthly grid merged with every actual event date, so the lines are smooth and
 * still capture sharp drops (e.g. a holiday spend) exactly when they happen.
 */
export function simulate(state: BucketsState, from: Date, to: Date): Timeline {
  const start = startOfDay(from);
  const end = startOfDay(to);

  // Running state, seeded from today.
  const bucketBal: Record<string, number> = {};
  for (const b of state.buckets) bucketBal[b.id] = bucketBalance(b);

  const acctBal: Record<string, number> = {};
  const acctAllocated: Record<string, number> = {};
  for (const a of state.accounts) {
    acctBal[a.id] = a.balance;
    acctAllocated[a.id] = accountView(a, state.buckets).allocated;
  }

  // Expand all scheduled cashflows into concrete dated events.
  const events: DueEvent[] = [];
  for (const b of state.buckets) {
    const fallbackAccount = mainAccountId(b);
    for (const cf of b.cashflows) {
      for (const date of occurrences(cf.recurrence, start, end)) {
        events.push({
          date,
          bucketId: b.id,
          accountId: cf.accountId ?? fallbackAccount,
          kind: cf.kind,
          amount: cf.amount,
          drain: cf.kind === "out" && !!cf.drain,
        });
      }
    }
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Markers: monthly grid (incl. start and end) ∪ event dates, deduped + sorted.
  const markerTimes = new Set<number>([start.getTime(), end.getTime()]);
  for (let d = start; d.getTime() < end.getTime(); d = addMonths(d, 1)) {
    markerTimes.add(d.getTime());
  }
  for (const e of events) markerTimes.add(e.date.getTime());
  const markers = [...markerTimes].sort((a, b) => a - b).map((t) => new Date(t));

  const timeline: Timeline = {
    dates: [],
    buckets: Object.fromEntries(state.buckets.map((b) => [b.id, []])),
    accounts: Object.fromEntries(state.accounts.map((a) => [a.id, []])),
    anyShortfall: false,
  };

  let ei = 0;
  for (const marker of markers) {
    while (ei < events.length && events[ei].date.getTime() <= marker.getTime()) {
      const e = events[ei++];
      const amount = e.drain ? Math.max(0, bucketBal[e.bucketId] ?? 0) : e.amount;
      const sign = e.kind === "in" ? 1 : -1;
      bucketBal[e.bucketId] = (bucketBal[e.bucketId] ?? 0) + sign * amount;
      if (e.accountId && e.accountId in acctBal) {
        acctBal[e.accountId] += sign * amount;
        acctAllocated[e.accountId] += sign * amount;
      }
    }

    timeline.dates.push(marker);
    for (const b of state.buckets) {
      const v = bucketBal[b.id] ?? 0;
      if (v < 0) timeline.anyShortfall = true;
      timeline.buckets[b.id].push(v);
    }
    for (const a of state.accounts) {
      timeline.accounts[a.id].push({
        balance: acctBal[a.id] ?? 0,
        unallocated: (acctBal[a.id] ?? 0) - (acctAllocated[a.id] ?? 0),
      });
    }
  }

  return timeline;
}

/** The first date in a timeline at which a bucket reaches `target`, or null. */
export function projectedTargetDate(
  timeline: Timeline,
  bucketId: string,
  target: number,
): Date | null {
  const series = timeline.buckets[bucketId];
  if (!series) return null;
  for (let i = 0; i < series.length; i++) {
    if (series[i] >= target) return timeline.dates[i];
  }
  return null;
}

/* ----------------------------------------------------------------------------
 * Validation at the trust boundary. Anything arriving from the editor, an API,
 * or an import passes through here before it is stored or trusted. (No DB yet —
 * this is ready for when buckets are persisted per instance.)
 *
 * Over-allocation (buckets claiming more than an account holds) is deliberately
 * NOT a hard error here — it's a real, recoverable state the user can be in
 * mid-edit, so it's computed via `accountView` and surfaced in the UI instead.
 * ------------------------------------------------------------------------- */

const MONEY = z.number().min(0).max(1e11);

export const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["offset", "savings", "current", "investment", "other"]),
  balance: MONEY,
});

export const allocationSchema = z.object({
  accountId: z.string().min(1),
  amount: MONEY,
});

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const recurrenceSchema = z.object({
  freq: z.enum(["once", "weekly", "monthly"]),
  startDate: ISO_DATE,
  endDate: ISO_DATE.optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  interval: z.number().int().min(1).max(52).optional(),
});

export const cashflowSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  kind: z.enum(["in", "out"]),
  amount: MONEY,
  drain: z.boolean().optional(),
  accountId: z.string().min(1).optional(),
  recurrence: recurrenceSchema,
});

export const bucketSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  glyph: z.string().min(1).max(8),
  target: MONEY.optional(),
  targetDate: ISO_DATE.optional(),
  allocations: z.array(allocationSchema),
  cashflows: z.array(cashflowSchema),
});

export const bucketsStateSchema = z.object({
  accounts: z.array(accountSchema),
  buckets: z.array(bucketSchema),
});

export type BucketsStateInput = z.input<typeof bucketsStateSchema>;
