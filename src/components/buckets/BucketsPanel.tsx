"use client";

import { useMemo, useState } from "react";
import {
  ACCOUNT_KINDS,
  BUCKET_GLYPHS,
  accountView,
  addMonths,
  bucketView,
  projectedTargetDate,
  simulate,
  startOfDay,
  summarise,
  type Bucket,
  type BucketsState,
} from "@/lib/buckets";
import BucketsTimeline from "./BucketsTimeline";
import BucketEditor from "./BucketEditor";
import BucketDetail from "./BucketDetail";
import AccountsEditor from "./AccountsEditor";

const AS_OF = [
  { id: 0, label: "Today" },
  { id: 3, label: "+3 mo" },
  { id: 6, label: "+6 mo" },
  { id: 12, label: "+1 yr" },
] as const;

const dayLabel = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const gbp0 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const kindLabel = (id: string) =>
  ACCOUNT_KINDS.find((k) => k.id === id)?.label ?? id;

/** A blank bucket to seed the editor when adding. */
const freshBucket = (): Bucket => ({
  id: crypto.randomUUID(),
  name: "",
  glyph: BUCKET_GLYPHS[0],
  allocations: [],
  cashflows: [],
});

/**
 * The headline buckets view: a virtual layer of purpose over real accounts.
 * It shows how much of each account is spoken for (and the unallocated
 * remainder — the money that's easy to lose track of in an offset), and how
 * each bucket is tracking toward its goal. State is owned by the parent and
 * flows back up through `onChange`.
 */
export default function BucketsPanel({
  state,
  onChange,
}: {
  state: BucketsState;
  onChange: (next: BucketsState) => void;
}) {
  // null = closed; a Bucket = editing/adding that bucket.
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
  // null = overview; a bucket id = its maximised detail view.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingAccounts, setEditingAccounts] = useState(false);
  const [asOfMonths, setAsOfMonths] = useState<(typeof AS_OF)[number]["id"]>(0);

  // Computed on the client (only mounts post-onboarding), so no SSR date skew.
  const today = useMemo(() => startOfDay(new Date()), []);
  // Long horizon used to find when each bucket reaches its target.
  const longTimeline = useMemo(
    () => simulate(state, today, addMonths(today, 60)),
    [state, today],
  );
  // Projection used by the accounts strip's "as of" selector.
  const asOfTimeline = useMemo(
    () => (asOfMonths === 0 ? null : simulate(state, today, addMonths(today, asOfMonths))),
    [state, today, asOfMonths],
  );
  const asOfDate = asOfMonths === 0 ? today : addMonths(today, asOfMonths);

  const summary = summarise(state);
  const anyOverAllocated = state.accounts.some(
    (a) => accountView(a, state.buckets).overAllocated,
  );

  const saveBucket = (bucket: Bucket) => {
    const exists = state.buckets.some((b) => b.id === bucket.id);
    onChange({
      ...state,
      buckets: exists
        ? state.buckets.map((b) => (b.id === bucket.id ? bucket : b))
        : [...state.buckets, bucket],
    });
    setEditingBucket(null);
  };

  const deleteBucket = (id: string) => {
    onChange({ ...state, buckets: state.buckets.filter((b) => b.id !== id) });
    setEditingBucket(null);
    if (detailId === id) setDetailId(null);
  };

  // Maximised single-bucket view. The editor can still open on top of it.
  const detailBucket = state.buckets.find((b) => b.id === detailId);
  if (detailBucket) {
    return (
      <>
        <BucketDetail
          bucket={detailBucket}
          accounts={state.accounts}
          onEdit={() => setEditingBucket(detailBucket)}
          onClose={() => setDetailId(null)}
        />
        {editingBucket && (
          <BucketEditor
            bucket={editingBucket}
            accounts={state.accounts}
            existing={state.buckets.some((b) => b.id === editingBucket.id)}
            onSave={saveBucket}
            onDelete={deleteBucket}
            onCancel={() => setEditingBucket(null)}
          />
        )}
      </>
    );
  }

  return (
    <section>
      {/* summary */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Total tracked" value={gbp0.format(summary.totalBalance)} />
        <Stat
          label="Given a purpose"
          value={gbp0.format(summary.totalAllocated)}
          accent="text-emerald"
        />
        <Stat
          label="Unallocated"
          value={gbp0.format(summary.totalUnallocated)}
          accent={summary.totalUnallocated > 0 ? "text-gold" : "text-muted"}
          hint="No purpose assigned yet"
        />
      </div>

      {anyOverAllocated && (
        <div className="mb-6 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-foreground">
          ⚠️ One or more accounts have more allocated to buckets than they
          actually hold. Trim a bucket or raise the account balance.
        </div>
      )}

      {/* look-ahead timeline */}
      <div className="mb-8">
        <BucketsTimeline state={state} today={today} />
      </div>

      {/* accounts */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Accounts
          {asOfMonths > 0 && (
            <span className="ml-2 normal-case text-muted/70">
              projected to {dayLabel(asOfDate)}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex gap-1 rounded-full border border-border bg-surface-2 p-1">
            {AS_OF.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setAsOfMonths(o.id)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  asOfMonths === o.id
                    ? "bg-surface text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEditingAccounts(true)}
            className="rounded-full border border-border px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-muted/50 hover:text-foreground"
          >
            Manage
          </button>
        </div>
      </div>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {state.accounts.map((account) => {
          const now = accountView(account, state.buckets);
          // Use the projected figures at the selected horizon, or today's.
          const projected = asOfTimeline?.accounts[account.id]?.at(-1);
          const balance = projected ? projected.balance : account.balance;
          const unallocated = projected ? projected.unallocated : now.unallocated;
          const allocated = balance - unallocated;
          const overAllocated = allocated > balance;
          const allocPct =
            balance > 0 ? Math.min(100, (allocated / balance) * 100) : 0;
          return (
            <div
              key={account.id}
              className="rounded-2xl border border-border bg-surface p-5"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-display text-base font-semibold">
                  {account.name}
                </span>
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  {kindLabel(account.kind)}
                </span>
              </div>
              <div className="mt-3 font-display text-2xl font-bold">
                {gbp0.format(balance)}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full rounded-full ${
                    overAllocated ? "bg-gold" : "bg-emerald"
                  }`}
                  style={{ width: `${allocPct}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-muted">
                  {gbp0.format(allocated)} allocated
                </span>
                <span className={unallocated !== 0 ? "text-gold" : "text-muted"}>
                  {gbp0.format(unallocated)} free
                </span>
              </div>
              {asOfMonths > 0 && (
                <div className="mt-1 text-[11px] text-muted/70">
                  {gbp0.format(account.balance)} today
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* buckets */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Buckets
        </h2>
        <button
          type="button"
          onClick={() => setEditingBucket(freshBucket())}
          className="rounded-full bg-emerald px-4 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
        >
          + Add bucket
        </button>
      </div>

      {state.buckets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center text-muted">
          No buckets yet. Add one to give your money a purpose.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {state.buckets.map((bucket) => {
            const v = bucketView(bucket);
            const pct = v.fundedPct === null ? null : Math.round(v.fundedPct * 100);
            const hitDate =
              bucket.target && v.remaining > 0
                ? projectedTargetDate(longTimeline, bucket.id, bucket.target)
                : null;
            return (
              <div
                key={bucket.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailId(bucket.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailId(bucket.id);
                  }
                }}
                className="cursor-pointer rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{bucket.glyph}</span>
                    <div>
                      <div className="font-display text-base font-semibold leading-tight">
                        {bucket.name}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {bucket.target
                          ? `${gbp0.format(v.balance)} of ${gbp0.format(bucket.target)}`
                          : gbp0.format(v.balance)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingBucket(bucket);
                    }}
                    className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-muted/50 hover:text-foreground"
                  >
                    Edit
                  </button>
                </div>

                {pct !== null && (
                  <>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-emerald"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-xs">
                      <span className="text-emerald">{pct}% funded</span>
                      <span className="text-muted">{targetLabel(bucket, v.remaining, hitDate)}</span>
                    </div>
                  </>
                )}

                {v.accountIds.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {Array.from(new Set(v.accountIds)).map((id) => {
                      const acc = state.accounts.find((a) => a.id === id);
                      if (!acc) return null;
                      return (
                        <span
                          key={id}
                          className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[11px] text-muted"
                        >
                          {acc.name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingBucket && (
        <BucketEditor
          bucket={editingBucket}
          accounts={state.accounts}
          existing={state.buckets.some((b) => b.id === editingBucket.id)}
          onSave={saveBucket}
          onDelete={deleteBucket}
          onCancel={() => setEditingBucket(null)}
        />
      )}

      {editingAccounts && (
        <AccountsEditor
          accounts={state.accounts}
          onSave={(accounts) => {
            onChange({ ...state, accounts });
            setEditingAccounts(false);
          }}
          onCancel={() => setEditingAccounts(false)}
        />
      )}
    </section>
  );
}

/**
 * What to say under a bucket's progress bar. When the goal has a deadline
 * (`targetDate`), reflect whether the projection beats it; otherwise just show
 * the projected hit date (or that no schedule funds it yet).
 */
function targetLabel(
  bucket: Bucket,
  remaining: number,
  hitDate: Date | null,
): string {
  if (remaining === 0) return "goal reached 🎉";
  if (hitDate === null) return "no schedule to reach it";

  const by = bucket.targetDate ? new Date(bucket.targetDate) : null;
  const hit = dayLabel(hitDate);
  if (by) {
    return hitDate.getTime() <= by.getTime()
      ? `on track · ${hit}`
      : `behind · ${hit}`;
  }
  return `~${hit}`;
}

function Stat({
  label,
  value,
  accent = "text-foreground",
  hint,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${accent}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}
