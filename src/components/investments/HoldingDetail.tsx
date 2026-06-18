"use client";

import { useMemo, useRef, useState } from "react";
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

const W = 820;
const H = 320;
const PAD = { top: 20, right: 20, bottom: 32, left: 64 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function money(n: number): string {
  const abs = Math.abs(n);
  const s =
    abs >= 1_000_000
      ? `£${Math.round(abs / 100_000) / 10}m`
      : abs >= 1_000
        ? `£${Math.round(abs / 100) / 10}k`
        : `£${Math.round(abs)}`;
  return n < 0 ? `-${s}` : s;
}

const yearLabel = (d: Date) => d.toLocaleDateString("en-GB", { year: "numeric" });

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

  // Scrubber: which point the cursor is nearest to, across both series.
  const [hover, setHover] = useState<{ series: "actual" | "projected"; idx: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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

  const projected = projection.dates.map((d, i) => ({
    t: d.getTime(),
    v: projection.value[i],
  }));

  // Chart range spans the earliest record (if any) through the projection end.
  const t0 = Math.min(actuals[0]?.t ?? today.getTime(), today.getTime());
  const t1 = projected[projected.length - 1]?.t ?? addMonths(today, months).getTime();
  const span = Math.max(1, t1 - t0);
  const yMax = Math.max(1, ...actuals.map((a) => a.v), ...projected.map((p) => p.v)) * 1.08;

  const x = (t: number) => PAD.left + ((t - t0) / span) * PLOT_W;
  const y = (v: number) => PAD.top + (1 - v / yMax) * PLOT_H;

  const projPath = projected
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(" ");
  const actualPath = actuals
    .map((a, i) => `${i === 0 ? "M" : "L"} ${x(a.t).toFixed(1)} ${y(a.v).toFixed(1)}`)
    .join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const xTicks = Array.from({ length: 6 }, (_, i) => t0 + (i / 5) * span);
  const projectedEnd = projection.value[projection.value.length - 1] ?? currentValue;
  const projGrowth = projectedEnd - currentValue - projection.contributed[projection.contributed.length - 1];

  // History totals.
  const totalContributed = periods.reduce((sum, p) => sum + p.contributed, 0);
  const totalGrowth = periods.reduce((sum, p) => sum + (p.growth ?? 0), 0);

  // Every hoverable point, across both series, for the scrubber to snap to.
  const allPoints = [
    ...actuals.map((a, i) => ({ ...a, series: "actual" as const, idx: i })),
    ...projected.map((p, i) => ({ ...p, series: "projected" as const, idx: i })),
  ];

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg || allPoints.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const tHover = t0 + ((px - PAD.left) / PLOT_W) * span;
    let best = allPoints[0];
    let bestD = Infinity;
    for (const pt of allPoints) {
      const d = Math.abs(pt.t - tHover);
      if (d < bestD) {
        bestD = d;
        best = pt;
      }
    }
    setHover({ series: best.series, idx: best.idx });
  };

  const hovered =
    hover === null
      ? null
      : hover.series === "actual"
        ? actuals[hover.idx]
        : projected[hover.idx];

  return (
    <section>
      {/* header */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{meta?.glyph}</span>
          <div>
            <h2 className="font-display text-2xl font-bold leading-tight">{holding.name}</h2>
            <div className="mt-0.5 text-sm text-muted">{meta?.label}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border border-border px-4 py-1.5 text-xs text-muted transition-colors hover:border-muted/50 hover:text-foreground"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-surface-2 px-4 py-1.5 text-xs font-semibold text-foreground transition-opacity hover:opacity-90"
          >
            ↙ Minimise
          </button>
        </div>
      </div>

      {/* headline stats */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Value today" value={gbp0.format(currentValue)} />
        <Stat
          label={`Projected in ${months / 12} years`}
          value={gbp0.format(projectedEnd)}
          accent="text-emerald"
          hint={`${money(projGrowth)} growth · ${money(projection.contributed[projection.contributed.length - 1] ?? 0)} added`}
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

      {/* chart */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold">Past & projected</h3>
            <p className="text-xs text-muted">
              Actual recorded values, then where it&apos;s heading on your assumptions.
              Hover the chart to read any point.
            </p>
          </div>
          <div className="inline-flex gap-1 rounded-full border border-border bg-surface-2 p-1">
            {HORIZONS.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setHorizon(h.id)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  horizon === h.id ? "bg-surface text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          className="block"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`${holding.name} value over time`}
        >
          {/* gridlines + y labels */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 10} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                {money(v)}
              </text>
            </g>
          ))}

          {/* x labels */}
          {xTicks.map((t, i) => (
            <text key={i} x={x(t)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {yearLabel(new Date(t))}
            </text>
          ))}

          {/* today divider */}
          <line
            x1={x(today.getTime())}
            x2={x(today.getTime())}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            stroke="var(--muted)"
            strokeWidth={1}
            strokeDasharray="3 4"
            opacity={0.7}
          />
          <text x={x(today.getTime())} y={PAD.top - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
            today
          </text>

          {/* projected (future) — dashed emerald */}
          <path d={projPath} fill="none" stroke="#34d399" strokeWidth={2.25} strokeDasharray="5 4" />

          {/* actual (past) — solid gold with point markers */}
          {actuals.length > 0 && (
            <>
              <path d={actualPath} fill="none" stroke="#f5be4a" strokeWidth={2.5} />
              {actuals.map((a, i) => (
                <circle key={i} cx={x(a.t)} cy={y(a.v)} r={3.5} fill="#f5be4a" stroke="var(--background)" strokeWidth={1.5} />
              ))}
            </>
          )}

          {/* hover scrubber: vertical line, highlighted marker, value tooltip */}
          {hover && hovered && (() => {
            const hx = x(hovered.t);
            const hy = y(hovered.v);
            const color = hover.series === "actual" ? "#f5be4a" : "#34d399";
            const d = new Date(hovered.t);

            const lines: string[] = [];
            if (hover.series === "actual") {
              const p = periods[hover.idx];
              lines.push(d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }));
              lines.push(gbp0.format(hovered.v));
              if (p?.growth != null) {
                const pct = p.growthPct != null ? ` (${p.growthPct >= 0 ? "+" : ""}${p.growthPct.toFixed(1)}%)` : "";
                lines.push(`${p.growth >= 0 ? "+" : ""}${gbp0.format(p.growth)}${pct} growth`);
              }
            } else {
              const added = projection.contributed[hover.idx] ?? 0;
              const g = hovered.v - currentValue - added;
              lines.push(d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }));
              lines.push(gbp0.format(hovered.v));
              lines.push(`${money(g)} growth · ${money(added)} added`);
            }

            const boxW = 178;
            const boxH = 12 + lines.length * 16;
            let bx = hx + 12;
            if (bx + boxW > W - PAD.right) bx = hx - 12 - boxW;
            let by = hy - boxH - 10;
            if (by < PAD.top) by = hy + 14;

            return (
              <g>
                <line x1={hx} x2={hx} y1={PAD.top} y2={PAD.top + PLOT_H} stroke={color} strokeWidth={1} strokeDasharray="3 4" opacity={0.85} />
                <circle cx={hx} cy={hy} r={5} fill={color} stroke="var(--background)" strokeWidth={2} />
                <g transform={`translate(${bx} ${by})`}>
                  <rect width={boxW} height={boxH} rx={8} fill="var(--surface-2)" stroke="var(--border)" strokeWidth={1} />
                  {lines.map((ln, i) => (
                    <text
                      key={i}
                      x={11}
                      y={20 + i * 16}
                      fontSize={i === 1 ? 13 : 11}
                      fontWeight={i === 1 ? 700 : 400}
                      fill={i === 0 ? "var(--muted)" : "var(--foreground)"}
                    >
                      {ln}
                    </text>
                  ))}
                </g>
              </g>
            );
          })()}
        </svg>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#f5be4a" }} />
            Recorded
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: "#34d399" }} />
            Projected
          </span>
        </div>
      </div>

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
    </section>
  );
}

function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className="font-display text-lg font-semibold">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald"
      />
    </label>
  );
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
