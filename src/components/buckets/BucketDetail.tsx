"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  bucketView,
  projectedTargetDate,
  simulate,
  startOfDay,
  toISO,
  type Bucket,
  type BucketsState,
  type Cashflow,
} from "@/lib/buckets";
import DetailShell from "../detail/DetailShell";
import ProjectionChart, { HorizonSelector } from "../detail/ProjectionChart";
import { Slider, Stat, compactMoney } from "../detail/primitives";

const gbp0 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const dayLabel = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const HORIZONS = [
  { id: "1y", label: "1 yr", months: 12 },
  { id: "2y", label: "2 yr", months: 24 },
  { id: "5y", label: "5 yr", months: 60 },
  { id: "10y", label: "10 yr", months: 120 },
] as const;

/** A synthetic recurring `in` cashflow modelling the what-if "extra monthly" lever. */
const extraContribution = (today: Date, amount: number): Cashflow => ({
  id: "__whatif_extra",
  label: "What-if contribution",
  kind: "in",
  amount,
  recurrence: { freq: "monthly", startDate: toISO(today), dayOfMonth: today.getDate() },
});

/**
 * The maximised, single-bucket view. Buckets have no recorded history, so this is
 * forward-only: it projects the bucket's balance from today across the chosen
 * horizon by replaying its scheduled cashflows, and lets you try an **extra monthly
 * contribution** to see how much sooner the goal lands. The goal (if set) is drawn
 * as a reference line, and the headline calls out the projected hit date. Minimise
 * to return to the buckets overview.
 */
export default function BucketDetail({
  bucket,
  accounts,
  onEdit,
  onClose,
}: {
  bucket: Bucket;
  accounts: BucketsState["accounts"];
  onEdit: () => void;
  onClose: () => void;
}) {
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]["id"]>("2y");

  const months = HORIZONS.find((h) => h.id === horizon)!.months;
  const today = useMemo(() => startOfDay(new Date()), []);

  const v = bucketView(bucket);

  // Project just this bucket, folding in the what-if extra contribution.
  const state: BucketsState = useMemo(() => {
    const whatIfBucket: Bucket =
      extraMonthly > 0
        ? { ...bucket, cashflows: [...bucket.cashflows, extraContribution(today, extraMonthly)] }
        : bucket;
    return { accounts, buckets: [whatIfBucket] };
  }, [bucket, accounts, today, extraMonthly]);

  const timeline = useMemo(
    () => simulate(state, today, addMonths(today, months)),
    [state, today, months],
  );
  const series = timeline.buckets[bucket.id] ?? [];
  const projected = timeline.dates.map((d, i) => ({ t: d.getTime(), v: series[i] ?? 0 }));
  const projectedEnd = series[series.length - 1] ?? v.balance;

  // When does the goal land, on these assumptions? Search a long horizon so the
  // answer doesn't depend on the chart's selected window.
  const hitDate = useMemo(() => {
    if (!bucket.target || v.balance >= bucket.target) return null;
    const long = simulate(state, today, addMonths(today, 600));
    return projectedTargetDate(long, bucket.id, bucket.target);
  }, [state, today, bucket.id, bucket.target, v.balance]);

  const tooltipLines = (_series: "actual" | "projected", idx: number): string[] => {
    const value = series[idx] ?? 0;
    const delta = value - v.balance;
    const lines = [
      timeline.dates[idx].toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      gbp0.format(value),
    ];
    if (bucket.target) {
      lines.push(`${Math.round((value / bucket.target) * 100)}% of goal`);
    } else {
      lines.push(`${delta >= 0 ? "+" : ""}${compactMoney(delta)} since today`);
    }
    return lines;
  };

  const goalReached = bucket.target ? v.balance >= bucket.target : false;

  return (
    <DetailShell glyph={bucket.glyph} title={bucket.name} subtitle="Purpose bucket" onEdit={onEdit} onClose={onClose}>
      {/* headline stats */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Balance today" value={gbp0.format(v.balance)} />
        <Stat
          label={`Projected in ${months / 12 >= 1 ? `${months / 12} year${months / 12 > 1 ? "s" : ""}` : `${months} months`}`}
          value={gbp0.format(projectedEnd)}
          accent="text-emerald"
          hint={`${projectedEnd - v.balance >= 0 ? "+" : ""}${compactMoney(projectedEnd - v.balance)} from scheduled flows`}
        />
        {bucket.target ? (
          <Stat
            label="Goal"
            value={gbp0.format(bucket.target)}
            accent="text-gold"
            hint={
              goalReached
                ? "reached 🎉"
                : hitDate
                  ? `on track · ${dayLabel(hitDate)}`
                  : "no schedule reaches it"
            }
          />
        ) : (
          <Stat label="Goal" value="None set" hint="add a target in Edit to track an ETA" />
        )}
      </div>

      <ProjectionChart
        today={today}
        projected={projected}
        title="Projected balance"
        subtitle="Where this bucket is heading on its scheduled flows. Hover the chart to read any point."
        ariaLabel={`${bucket.name} balance over time`}
        projectedLabel="Projected balance"
        reference={bucket.target ? { value: bucket.target, label: "goal" } : undefined}
        headerRight={<HorizonSelector options={HORIZONS} value={horizon} onChange={setHorizon} />}
        tooltipLines={tooltipLines}
      />

      {/* what-if controls */}
      <div className="mt-4 rounded-2xl border border-border bg-surface p-5">
        <div className="mb-1 font-display text-base font-semibold">What if you added more?</div>
        <p className="mb-4 text-xs text-muted">
          Try an extra monthly top-up — this only changes the projection, not your saved bucket.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Slider
            label="Extra monthly contribution"
            value={extraMonthly}
            display={extraMonthly > 0 ? `+${gbp0.format(extraMonthly)}` : "—"}
            min={0}
            max={3000}
            step={25}
            onChange={setExtraMonthly}
          />
          {bucket.target && (
            <div className="flex flex-col justify-center">
              <div className="text-xs text-muted">Projected to reach goal</div>
              <div className="mt-1 font-display text-lg font-semibold">
                {goalReached ? "Already there 🎉" : hitDate ? dayLabel(hitDate) : "not on this schedule"}
              </div>
            </div>
          )}
        </div>
      </div>
    </DetailShell>
  );
}
