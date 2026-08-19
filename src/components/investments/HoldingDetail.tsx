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
import { HOME_CURRENCY } from "@/lib/money";
import DetailShell from "../detail/DetailShell";
import ProjectionChart, { HorizonSelector } from "../detail/ProjectionChart";
import { Slider, Stat, compactMoney } from "../detail/primitives";

const gbp0 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: HOME_CURRENCY,
  maximumFractionDigits: 0,
});

const kindMeta = (id: string) => HOLDING_KINDS.find((k) => k.id === id);

const HORIZONS = [
  { id: "5y", label: "5 yr", months: 60 },
  { id: "10y", label: "10 yr", months: 120 },
  { id: "20y", label: "20 yr", months: 240 },
  { id: "30y", label: "30 yr", months: 360 },
] as const;

// The what-if lever bounds (kept in sync with the sliders below). MAX_EXTRA is used
// to size a stable y-axis ceiling so dragging the contribution lever doesn't rescale.
const MAX_EXTRA = 5000;
const GROWTH_DELTA = 10;

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

  // What-if levers, mirroring the whole-portfolio view: both are neutral (0) at rest
  // and layer *on top of* the holding's own assumptions — an extra monthly contribution
  // and a growth nudge — so adding money always grows the line (never dips below the
  // as-is baseline). The holding's real contribution/growth are the seeded baseline.
  const seedMonthly = useMemo(() => Math.round(monthlyContributionOf(holding)), [holding]);
  const seedGrowthPct = useMemo(() => assumedAnnualGrowthPct(holding), [holding]);
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [growthDeltaPct, setGrowthDeltaPct] = useState(0);
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]["id"]>("10y");

  const months = HORIZONS.find((h) => h.id === horizon)!.months;
  const leversActive = extraMonthly !== 0 || growthDeltaPct !== 0;
  const monthly = seedMonthly + extraMonthly;
  const growthPct = seedGrowthPct + growthDeltaPct;

  const today = useMemo(() => startOfDay(new Date()), []);
  const end = useMemo(() => addMonths(today, months), [today, months]);
  const projection = useMemo(
    () => projectHolding(currentValue, today, end, monthly, growthPct),
    [currentValue, today, end, monthly, growthPct],
  );
  // The untouched "as-is" path — computed only when a lever moves, to overlay for comparison.
  const baseline = useMemo(
    () =>
      leversActive
        ? projectHolding(currentValue, today, end, seedMonthly, seedGrowthPct)
        : null,
    [leversActive, currentValue, today, end, seedMonthly, seedGrowthPct],
  );
  // A stable y-axis ceiling: the projection at the *maximum* extra contribution (at the
  // current growth). The axis is sized to the biggest the contribution lever can make the
  // line, so dragging that lever grows the line into a fixed frame instead of rescaling the
  // axis — the portfolio's magic-number-anchored feel, without a magic number. Depends on
  // growth (and horizon), not on the current extra, so a contribution drag never rescales.
  const axisMax = useMemo(() => {
    const ceiling = projectHolding(currentValue, today, end, seedMonthly + MAX_EXTRA, growthPct);
    return ceiling.value[ceiling.value.length - 1] ?? currentValue;
  }, [currentValue, today, end, seedMonthly, growthPct]);

  // Actual recorded points (oldest-first), as plottable date/value pairs.
  const actuals = useMemo(
    () => periods.map((p) => ({ t: startOfDay(new Date(p.date)).getTime(), v: p.value })),
    [periods],
  );
  const projected = projection.dates.map((d, i) => ({ t: d.getTime(), v: projection.value[i] }));
  const compare = baseline
    ? { points: baseline.dates.map((d, i) => ({ t: d.getTime(), v: baseline.value[i] })), label: "As-is" }
    : undefined;

  const projectedEnd = projection.value[projection.value.length - 1] ?? currentValue;
  const projContributed = projection.contributed[projection.contributed.length - 1] ?? 0;
  const projGrowth = projectedEnd - currentValue - projContributed;
  const baselineEnd = baseline ? baseline.value[baseline.value.length - 1] ?? projectedEnd : projectedEnd;
  const delta = projectedEnd - baselineEnd;

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
          hint={
            leversActive
              ? `${delta >= 0 ? "+" : ""}${compactMoney(delta)} vs as-is · ${compactMoney(projContributed)} added`
              : `${compactMoney(projGrowth)} growth · ${compactMoney(projContributed)} added`
          }
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
        projectedLabel={leversActive ? "With your changes" : "Projected"}
        compare={compare}
        axisMax={axisMax}
        headerRight={<HorizonSelector options={HORIZONS} value={horizon} onChange={setHorizon} />}
        tooltipLines={tooltipLines}
      />

      {/* what-if levers — same model as the whole-portfolio view: layered on top of
          the holding's own contribution + growth, so the muted "as-is" line is the
          floor and adding money only ever grows the projection. */}
      <div className="mt-4 rounded-2xl border border-border bg-surface p-5">
        <div className="mb-1 font-display text-base font-semibold">What-if levers</div>
        <p className="mb-4 text-xs text-muted">
          These layer on top of this holding&apos;s own contribution and growth — they only change
          the projection, not your saved holding. Move a lever and the muted line shows its current
          plan for comparison. Adjust the saved figures in Edit.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Slider
            label="Extra monthly contribution"
            value={extraMonthly}
            display={`${gbp0.format(extraMonthly)}/mo`}
            min={0}
            max={MAX_EXTRA}
            step={50}
            onChange={setExtraMonthly}
          />
          <Slider
            label="Growth adjustment"
            value={growthDeltaPct}
            display={`${growthDeltaPct > 0 ? "+" : ""}${growthDeltaPct.toFixed(1)}%`}
            min={-GROWTH_DELTA}
            max={GROWTH_DELTA}
            step={0.5}
            onChange={setGrowthDeltaPct}
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
