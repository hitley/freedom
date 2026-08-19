import { z } from "zod";
import type {
  Account,
  AccountFlow,
  AccountView,
  Bucket,
  BucketsState,
  BucketsSummary,
  BucketView,
  FundingStrategy,
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
  /** True if any bucket dips below $0 at any point (a spend it can't cover). */
  anyShortfall: boolean;
}

/** The account a bucket is funded from: its explicit source, else its main account. */
export function fundingAccountId(bucket: Bucket): string | undefined {
  return bucket.sourceAccountId ?? mainAccountId(bucket);
}

/** Whole calendar months from `from` to `to`, floored at 0. */
function monthsUntil(from: Date, to: Date): number {
  return Math.max(
    0,
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()),
  );
}

/** A bucket reduced to just what funding distribution needs. */
export interface FundingBucket {
  id: string;
  balance: number;
  target?: number;
  targetDate?: string;
}

/**
 * Split `amount` across `buckets` per `strategy`, returning how much each bucket
 * receives (never more than its remaining-to-target). Buckets are considered in the
 * order given — that order *is* the priority for `priority`, and the tiebreak for the
 * others. Pure; `asOf` drives the `target-date` required-per-month maths. See
 * `design-notes/006` for the model.
 */
export function distributeFunding(
  amount: number,
  buckets: FundingBucket[],
  strategy: FundingStrategy,
  asOf: Date,
): Record<string, number> {
  const give: Record<string, number> = {};
  const EPS = 1e-6;
  // Remaining-to-target *after* what we've already provisionally given this call.
  const remaining = (b: FundingBucket) =>
    b.target != null ? Math.max(0, b.target - (b.balance + (give[b.id] ?? 0))) : Infinity;
  const add = (id: string, g: number) => {
    if (g > 0) give[id] = (give[id] ?? 0) + g;
  };

  let left = amount;
  if (left <= EPS) return give;

  if (strategy === "priority") {
    for (const b of buckets) {
      if (left <= EPS) break;
      const g = Math.min(remaining(b), left);
      add(b.id, g);
      left -= g;
    }
    return give;
  }

  if (strategy === "even") {
    // Repeated passes so a bucket that hits its target releases its share to the rest.
    for (let pass = 0; pass < buckets.length + 1 && left > EPS; pass++) {
      const eligible = buckets.filter((b) => remaining(b) > EPS);
      if (eligible.length === 0) break;
      const share = left / eligible.length;
      let spent = 0;
      for (const b of eligible) {
        const g = Math.min(remaining(b), share);
        add(b.id, g);
        spent += g;
      }
      if (spent <= EPS) break;
      left -= spent;
    }
    return give;
  }

  // target-date: each dated bucket needs `remaining ÷ months-left` this period. Fund
  // those needs in order (a shortfall falls to the earliest-listed), then spread any
  // leftover across remaining capacity as a priority waterfall.
  for (const b of buckets) {
    if (left <= EPS) break;
    if (b.target == null || !b.targetDate) continue;
    const rem = remaining(b);
    if (rem <= EPS) continue;
    const need = Math.min(rem, rem / Math.max(1, monthsUntil(asOf, startOfDay(new Date(b.targetDate)))));
    const g = Math.min(need, left);
    add(b.id, g);
    left -= g;
  }
  for (const b of buckets) {
    if (left <= EPS) break;
    const g = Math.min(remaining(b), left);
    add(b.id, g);
    left -= g;
  }
  return give;
}

/** A recurring account movement not tied to a bucket, carrying its account id. */
export type ScopedAccountFlow = AccountFlow & { accountId: string };

/** One dated thing that happens in the simulation, ordered within a day by `order`. */
interface SimEvent {
  date: Date;
  order: number; // 0 = money in, 1 = money out, 2 = funding sweep (after in/out settle)
  apply: () => void;
}

/**
 * Project buckets + accounts from `from` to `to`. Snapshots are taken on a
 * monthly grid merged with every actual event date, so the lines are smooth and
 * still capture sharp drops (e.g. a holiday spend) exactly when they happen.
 *
 * Beyond bucket cashflows this now replays **account flows** (salary in, bills/mortgage
 * out — plus any `injectedFlows` *derived* from other Components, e.g. investment
 * contributions) and **funding sweeps** (an account's `FundingPlan` moving its
 * unallocated surplus into its buckets each period). Accounts with neither behave
 * exactly as before, so existing data is untouched.
 */
export function simulate(
  state: BucketsState,
  from: Date,
  to: Date,
  opts: { injectedFlows?: ScopedAccountFlow[] } = {},
): Timeline {
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

  // Which buckets each funding account fills, in priority (display) order.
  const bucketsByFunder = new Map<string, Bucket[]>();
  for (const b of state.buckets) {
    const acc = fundingAccountId(b);
    if (!acc) continue;
    (bucketsByFunder.get(acc) ?? bucketsByFunder.set(acc, []).get(acc)!).push(b);
  }

  const events: SimEvent[] = [];

  // Bucket cashflows: move a bucket, and the account they flow through.
  for (const b of state.buckets) {
    const fallbackAccount = mainAccountId(b);
    for (const cf of b.cashflows) {
      const accId = cf.accountId ?? fallbackAccount;
      const sign = cf.kind === "in" ? 1 : -1;
      const drain = cf.kind === "out" && !!cf.drain;
      for (const date of occurrences(cf.recurrence, start, end)) {
        events.push({
          date,
          order: cf.kind === "in" ? 0 : 1,
          apply: () => {
            const amount = drain ? Math.max(0, bucketBal[b.id] ?? 0) : cf.amount;
            bucketBal[b.id] = (bucketBal[b.id] ?? 0) + sign * amount;
            if (accId && accId in acctBal) {
              acctBal[accId] += sign * amount;
              acctAllocated[accId] += sign * amount;
            }
          },
        });
      }
    }
  }

  // Account flows (stored + injected/derived): move an account balance only.
  const allFlows: ScopedAccountFlow[] = [
    ...state.accounts.flatMap((a) => (a.flows ?? []).map((f) => ({ ...f, accountId: a.id }))),
    ...(opts.injectedFlows ?? []),
  ];
  for (const f of allFlows) {
    if (!(f.accountId in acctBal)) continue;
    const sign = f.kind === "in" ? 1 : -1;
    for (const date of occurrences(f.recurrence, start, end)) {
      events.push({
        date,
        order: f.kind === "in" ? 0 : 1,
        apply: () => {
          acctBal[f.accountId] += sign * f.amount;
        },
      });
    }
  }

  // Funding sweeps: reclassify an account's unallocated surplus into its buckets.
  for (const a of state.accounts) {
    if (!a.funding) continue;
    const plan = a.funding;
    for (const date of occurrences(plan.cadence, start, end)) {
      events.push({
        date,
        order: 2,
        apply: () => {
          const unallocated = Math.max(0, (acctBal[a.id] ?? 0) - (acctAllocated[a.id] ?? 0));
          const sweep =
            plan.amount != null
              ? Math.min(plan.amount, unallocated)
              : unallocated * ((plan.sharePct ?? 100) / 100);
          if (sweep <= 0) return;
          const funded = bucketsByFunder.get(a.id) ?? [];
          const give = distributeFunding(
            sweep,
            funded.map((b) => ({
              id: b.id,
              balance: bucketBal[b.id] ?? 0,
              target: b.target,
              targetDate: b.targetDate,
            })),
            plan.strategy,
            date,
          );
          for (const [bid, g] of Object.entries(give)) {
            bucketBal[bid] = (bucketBal[bid] ?? 0) + g;
            acctAllocated[a.id] += g;
          }
        },
      });
    }
  }

  events.sort((x, y) => x.date.getTime() - y.date.getTime() || x.order - y.order);

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
      events[ei++].apply();
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
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const recurrenceSchema = z.object({
  freq: z.enum(["once", "weekly", "monthly"]),
  startDate: ISO_DATE,
  endDate: ISO_DATE.optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  interval: z.number().int().min(1).max(52).optional(),
  count: z.number().int().min(1).max(1040).optional(),
});

export const accountFlowSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  kind: z.enum(["in", "out"]),
  amount: MONEY,
  recurrence: recurrenceSchema,
});

export const fundingPlanSchema = z.object({
  strategy: z.enum(["target-date", "priority", "even"]),
  cadence: recurrenceSchema,
  amount: MONEY.optional(),
  sharePct: z.number().min(0).max(100).optional(),
});

export const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["offset", "savings", "current", "investment", "other"]),
  balance: MONEY,
  flows: z.array(accountFlowSchema).optional(),
  funding: fundingPlanSchema.optional(),
});

export const allocationSchema = z.object({
  accountId: z.string().min(1),
  amount: MONEY,
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
  sourceAccountId: z.string().min(1).optional(),
  allocations: z.array(allocationSchema),
  cashflows: z.array(cashflowSchema),
});

export const bucketsStateSchema = z.object({
  accounts: z.array(accountSchema),
  buckets: z.array(bucketSchema),
});

export type BucketsStateInput = z.input<typeof bucketsStateSchema>;
