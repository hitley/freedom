"use client";

import { useMemo, useState } from "react";
import { addMonths, startOfDay } from "@/lib/buckets";
import {
  assumedAnnualGrowthPct,
  holdingHistory,
  holdingValue,
  monthlyContribution as monthlyContributionOf,
  projectHolding,
  HOLDING_KINDS,
  type Holding,
  type Quote,
} from "@/lib/investments";
import DetailShell from "../detail/DetailShell";
import ProjectionChart, { HorizonSelector } from "../detail/ProjectionChart";
import { Slider, Stat, compactMoney } from "../detail/primitives";

const gbp0 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const kindMeta = (id: string) => HOLDING_KINDS.find((k) => k.id === id);

const HORIZONS = [
  { id: "5y", label: "5 yr", months: 60 },
  { id: "10y", label: "10 yr", months: 120 },
  { id: "20y", label: "20 yr", months: 240 },
  { id: "30y", label: "30 yr", months: 360 },
] as const;

/**
 * The maximised, single-holding view. It tells the holding's whole story on one
 * timeline: the **actual** values you've recorded in the past (left of "today"),
 * then a **projection** of where it's heading (right of today), driven by two live
 * what-if levers — a flat monthly contribution and an estimated annual growth %.
 * Below the chart, the recorded history breaks down growth year by year. Minimise
 * to return to the portfolio overview.
 */
export default function HoldingDetail({
  holding,
  quotes,
  onEdit,
  onClose,
}: {
  holding: Holding;
  quotes?: Record<string, Quote>;
  onEdit: () => void;
  onClose: () => void;
}) {
  const meta = kindMeta(holding.kind);
  const currentValue = holdingValue(holding, quotes);
  const periods = useMemo(() => holdingHistory(holding), [holding]);

  // What-if levers, seeded from the holding's own assumptions.
  const [monthly, setMonthly] = useState(() =>
    Math.round(monthlyContributionOf(holding)),
  );
  const [growthPct, setGrowthPct] = useState(() => assumedAnnualGrowthPct(holding));
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]["id"]>("10y");

  const months = HORIZONS.find((h) => h.id === horizon)!.months;

  const today = useMemo(() => startOfDay(new Date()), []);
  const projection = useMemo(
    () => projectHolding(currentValue, today, addMonths(today, months), monthly, growthPct),
    [currentValue, today, months, monthly, growthPct],
  );

  // Actual recorded points (oldest-first), as plottable date/value pairs.
  const actuals = useMemo(
    () => periods.map((p) => ({ t: startOfDay(new Date(p.date)).getTime(), v: p.value })),
    [periods],
  );
  const projected = projection.dates.map((d, i) => ({ t: d.getTime(), v: projection.value[i] }));

  const projectedEnd = projection.value[projection.value.length - 1] ?? currentValue;
  const projContributed = projection.contributed[projection.contributed.length - 1] ?? 0;
  const projGrowth = projectedEnd - currentValue - projContributed;

  // History totals.
  const totalContributed = periods.reduce((sum, p) => sum + p.contributed, 0);
  const totalGrowth = periods.reduce((sum, p) => sum + (p.growth ?? 0), 0);

  // Domain-specific tooltip: actuals read from `periods`, projected from `projection`.
  const tooltipLines = (series: "actual" | "projected", idx: number): string[] => {
    if (series === "actual") {
      const p = periods[idx];
      const lines = [
        new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        gbp0.format(p.value),
      ];
      if (p?.growth != null) {
        const pct = p.growthPct != null ? ` (${p.growthPct >= 0 ? "+" : ""}${p.growthPct.toFixed(1)}%)` : "";
        lines.push(`${p.growth >= 0 ? "+" : ""}${gbp0.format(p.growth)}${pct} growth`);
      }
      return lines;
    }
    const added = projection.contributed[idx] ?? 0;
    const value = projection.value[idx] ?? currentValue;
    const g = value - currentValue - added;
    return [
      projection.dates[idx].toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      gbp0.format(value),
      `${compactMoney(g)} growth · ${compactMoney(added)} added`,
    ];
  };

  return (
    <DetailShell glyph={meta?.glyph} title={holding.name} subtitle={meta?.label} onEdit={onEdit} onClose={onClose}>
      {/* headline stats */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Value today" value={gbp0.format(currentValue)} />
        <Stat
          label={`Projected in ${months / 12} years`}
          value={gbp0.format(projectedEnd)}
          accent="text-emerald"
          hint={`${compactMoney(projGrowth)} growth · ${compactMoney(projContributed)} added`}
        />
        {periods.length > 0 ? (
          <Stat
            label="Recorded growth"
            value={`${totalGrowth >= 0 ? "+" : ""}${gbp0.format(totalGrowth)}`}
            accent="text-gold"
            hint={`across ${periods.length} records · ${gbp0.format(totalContributed)} paid in`}
          />
        ) : (
          <Stat label="History" value="None yet" hint="add records in Edit to track the past" />
        )}
      </div>

      <ProjectionChart
        today={today}
        actual={actuals}
        projected={projected}
        title="Past & projected"
        subtitle="Actual recorded values, then where it's heading on your assumptions. Hover the chart to read any point."
        ariaLabel={`${holding.name} value over time`}
        headerRight={<HorizonSelector options={HORIZONS} value={horizon} onChange={setHorizon} />}
        tooltipLines={tooltipLines}
      />

      {/* what-if controls */}
      <div className="mt-4 rounded-2xl border border-border bg-surface p-5">
        <div className="mb-1 font-display text-base font-semibold">Projection assumptions</div>
        <p className="mb-4 text-xs text-muted">
          Try different numbers — this only changes the projection, not your saved holding. Save them in Edit.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Slider
            label="Monthly contribution"
            value={monthly}
            display={gbp0.format(monthly)}
            min={0}
            max={5000}
            step={50}
            onChange={setMonthly}
          />
          <Slider
            label="Estimated growth / yr"
            value={growthPct}
            display={`${growthPct.toFixed(1)}%`}
            min={0}
            max={15}
            step={0.5}
            onChange={setGrowthPct}
          />
        </div>
      </div>

      {/* history breakdown */}
      {periods.length > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-5">
          <div className="mb-3 font-display text-base font-semibold">Recorded history</div>
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 border-b border-border pb-2 text-[11px] uppercase tracking-wide text-muted">
            <span>Date</span>
            <span className="text-right">Value</span>
            <span className="text-right">Paid in</span>
            <span className="text-right">Growth</span>
          </div>
          {periods.map((p) => (
            <div key={p.date} className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 border-b border-border/50 py-2 text-sm last:border-0">
              <span className="text-muted">
                {new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <span className="text-right font-medium">{gbp0.format(p.value)}</span>
              <span className="text-right text-muted">{p.contributed > 0 ? gbp0.format(p.contributed) : "—"}</span>
              <span className="text-right">
                {p.growth === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className={p.growth >= 0 ? "text-emerald" : "text-gold"}>
                    {p.growth >= 0 ? "+" : ""}
                    {gbp0.format(p.growth)}
                    {p.growthPct !== null && (
                      <span className="ml-1 text-xs text-muted">
                        ({p.growthPct >= 0 ? "+" : ""}
                        {p.growthPct.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </DetailShell>
  );
}
