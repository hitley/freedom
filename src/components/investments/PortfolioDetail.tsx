"use client";

import { useMemo, useState } from "react";
import { addMonths, startOfDay } from "@/lib/buckets";
import { projectPortfolio, type InvestmentsState, type Quote } from "@/lib/investments";
import { HOME_CURRENCY } from "@/lib/money";
import DetailShell from "../detail/DetailShell";
import ProjectionChart, { HorizonSelector } from "../detail/ProjectionChart";
import { Slider, Stat, compactMoney } from "../detail/primitives";

const gbp0 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: HOME_CURRENCY,
  maximumFractionDigits: 0,
});

const HORIZONS = [
  { id: "1y", label: "1 yr", months: 12 },
  { id: "5y", label: "5 yr", months: 60 },
  { id: "10y", label: "10 yr", months: 120 },
  { id: "20y", label: "20 yr", months: 240 },
  { id: "30y", label: "30 yr", months: 360 },
] as const;

/**
 * The maximised **whole-portfolio** projection. It rolls every holding forward on
 * one timeline (each keeping its own growth and contributions) across a selectable
 * horizon, with two portfolio-level what-if levers — an extra monthly contribution
 * and an optimistic/pessimistic growth nudge. When a `magicNumber` is supplied it's
 * drawn as a reference line, so you can see the year the portfolio crosses the
 * finish line into financial freedom. Pass a home-currency `state` (FX applied), so
 * the baseline matches the summary's "Projected in 1 year". Minimise to return.
 */
export default function PortfolioDetail({
  state,
  quotes,
  magicNumber,
  onShowFreedom,
  onClose,
}: {
  state: InvestmentsState;
  quotes?: Record<string, Quote>;
  /** The financial-freedom target, drawn as a reference line when finite. */
  magicNumber?: number | null;
  /** Jump to the freedom trajectory (Trajectory view); shown as a corner action. */
  onShowFreedom?: () => void;
  onClose: () => void;
}) {
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [growthDeltaPct, setGrowthDeltaPct] = useState(0);
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]["id"]>("10y");

  const months = HORIZONS.find((h) => h.id === horizon)!.months;
  const today = useMemo(() => startOfDay(new Date()), []);
  const end = useMemo(() => addMonths(today, months), [today, months]);
  const leversActive = extraMonthly !== 0 || growthDeltaPct !== 0;

  const projection = useMemo(
    () => projectPortfolio(state, today, end, { extraMonthly, growthDeltaPct, quotes }),
    [state, today, end, extraMonthly, growthDeltaPct, quotes],
  );
  // The untouched "as-is" path — computed only when a lever moves, to overlay for comparison.
  const baseline = useMemo(
    () => (leversActive ? projectPortfolio(state, today, end, { quotes }) : null),
    [state, today, end, leversActive, quotes],
  );

  const valueToday = projection.value[0] ?? 0;
  const projectedEnd = projection.value[projection.value.length - 1] ?? valueToday;
  const projContributed = projection.contributed[projection.contributed.length - 1] ?? 0;
  const projGrowth = projectedEnd - valueToday - projContributed;
  const baselineEnd = baseline ? baseline.value[baseline.value.length - 1] ?? projectedEnd : projectedEnd;
  const delta = projectedEnd - baselineEnd;

  const projected = projection.dates.map((d, i) => ({ t: d.getTime(), v: projection.value[i] }));
  const compare = baseline
    ? { points: baseline.dates.map((d, i) => ({ t: d.getTime(), v: baseline.value[i] })), label: "As-is" }
    : undefined;

  const hasTarget = magicNumber != null && Number.isFinite(magicNumber);
  const reference = hasTarget
    ? { value: magicNumber as number, label: `Freedom · ${compactMoney(magicNumber as number)}` }
    : undefined;

  // When does the projection cross the magic number within this horizon?
  const crossIdx = hasTarget
    ? projection.value.findIndex((v) => v >= (magicNumber as number))
    : -1;
  const freedom = !hasTarget
    ? null
    : crossIdx === 0
      ? { value: "You're there 🎉", hint: "already past your magic number" }
      : crossIdx > 0
        ? {
            value: `~${projection.dates[crossIdx].getFullYear()}`,
            hint: `crosses ${gbp0.format(magicNumber as number)}`,
          }
        : { value: `Beyond ${months / 12} yr`, hint: `not within this horizon at these settings` };

  const tooltipLines = (_series: "actual" | "projected", idx: number): string[] => {
    const value = projection.value[idx] ?? valueToday;
    const added = projection.contributed[idx] ?? 0;
    const growth = value - valueToday - added;
    return [
      projection.dates[idx].toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      gbp0.format(value),
      `${compactMoney(growth)} growth · ${compactMoney(added)} added`,
    ];
  };

  return (
    <DetailShell glyph="📈" title="Whole portfolio" subtitle="Projected across horizons" onClose={onClose}>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Value today" value={gbp0.format(valueToday)} />
        <Stat
          label={`Projected in ${months / 12} ${months === 12 ? "year" : "years"}`}
          value={gbp0.format(projectedEnd)}
          accent="text-emerald"
          hint={
            leversActive
              ? `${delta >= 0 ? "+" : ""}${compactMoney(delta)} vs as-is · ${compactMoney(projContributed)} added`
              : `${compactMoney(projGrowth)} growth · ${compactMoney(projContributed)} added`
          }
        />
        {freedom ? (
          <Stat
            label="Reaches freedom"
            value={freedom.value}
            accent="text-gold"
            hint={freedom.hint}
            action={onShowFreedom ? { label: "See your freedom trajectory", onClick: onShowFreedom } : undefined}
          />
        ) : (
          <Stat label="Contributions" value={gbp0.format(projContributed)} hint="paid in over the horizon" />
        )}
      </div>

      <ProjectionChart
        today={today}
        projected={projected}
        title="Portfolio projection"
        subtitle="Every holding rolled forward on your assumptions. Hover to read any point; drag the levers to explore."
        ariaLabel="Whole-portfolio value over time"
        projectedLabel={leversActive ? "With your changes" : "Projected value"}
        compare={compare}
        headerRight={<HorizonSelector options={HORIZONS} value={horizon} onChange={setHorizon} />}
        reference={reference}
        tooltipLines={tooltipLines}
      />

      <div className="mt-4 rounded-2xl border border-border bg-surface p-5">
        <div className="mb-1 font-display text-base font-semibold">What-if levers</div>
        <p className="mb-4 text-xs text-muted">
          These only change this projection, not your holdings. Growth adjustment nudges every
          holding&apos;s assumed return up or down together.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Slider
            label="Extra monthly contribution"
            value={extraMonthly}
            display={`${gbp0.format(extraMonthly)}/mo`}
            min={0}
            max={5000}
            step={50}
            onChange={setExtraMonthly}
          />
          <Slider
            label="Growth adjustment"
            value={growthDeltaPct}
            display={`${growthDeltaPct > 0 ? "+" : ""}${growthDeltaPct.toFixed(1)}%`}
            min={-3}
            max={3}
            step={0.5}
            onChange={setGrowthDeltaPct}
          />
        </div>
      </div>
    </DetailShell>
  );
}
