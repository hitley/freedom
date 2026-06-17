"use client";

import { useMemo, useRef, useState } from "react";
import { addMonths, simulate, type BucketsState } from "@/lib/buckets";

/** Distinct line colours; theme only ships emerald/gold, so the rest are fixed hues. */
const CHART_COLORS = [
  "#34d399", // emerald
  "#f5be4a", // gold
  "#60a5fa", // blue
  "#f472b6", // pink
  "#a78bfa", // violet
  "#2dd4bf", // teal
];

const HORIZONS = [
  { id: "3m", label: "3 mo", months: 3 },
  { id: "6m", label: "6 mo", months: 6 },
  { id: "1y", label: "1 yr", months: 12 },
  { id: "2y", label: "2 yr", months: 24 },
] as const;

const W = 820;
const H = 360;
const PAD = { top: 24, right: 20, bottom: 36, left: 64 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function money(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1_000 ? `£${Math.round(abs / 100) / 10}k` : `£${Math.round(abs)}`;
  return n < 0 ? `-${s}` : s;
}

const monthLabel = (d: Date) =>
  d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

const dayLabel = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });

/**
 * The look-ahead: every bucket's projected balance over time, driven by its
 * scheduled cashflows. Saving climbs the lines; dated spends (e.g. a holiday)
 * show as sharp drops. Hover to read the exact balances on any date.
 */
export default function BucketsTimeline({
  state,
  today,
}: {
  state: BucketsState;
  today: Date;
}) {
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]["id"]>("6m");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const months = HORIZONS.find((h) => h.id === horizon)!.months;
  const to = useMemo(() => addMonths(today, months), [today, months]);
  const timeline = useMemo(() => simulate(state, today, to), [state, today, to]);

  const t0 = timeline.dates[0]?.getTime() ?? today.getTime();
  const t1 = timeline.dates[timeline.dates.length - 1]?.getTime() ?? to.getTime();
  const span = Math.max(1, t1 - t0);

  // y-range across every bucket line (allow negative — a spend it can't cover).
  let yMin = 0;
  let yMax = 0;
  for (const series of Object.values(timeline.buckets)) {
    for (const v of series) {
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
  }
  yMax = yMax * 1.08 || 1;

  const x = (t: number) => PAD.left + ((t - t0) / span) * PLOT_W;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * PLOT_H;

  const buckets = state.buckets;
  const yZero = y(0);

  // y-axis ticks.
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));
  // x-axis ticks: ~6 evenly spaced dates.
  const xTickIdx = Array.from({ length: 6 }, (_, i) =>
    Math.round((i / 5) * (timeline.dates.length - 1)),
  ).filter((v, i, a) => a.indexOf(v) === i);

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const tHover = t0 + ((px - PAD.left) / PLOT_W) * span;
    // Nearest sample index.
    let best = 0;
    let bestD = Infinity;
    timeline.dates.forEach((d, i) => {
      const dist = Math.abs(d.getTime() - tHover);
      if (dist < bestD) {
        bestD = dist;
        best = i;
      }
    });
    setHover(best);
  };

  const hoverDate = hover !== null ? timeline.dates[hover] : null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Look ahead</h2>
          <p className="text-xs text-muted">
            Projected balances from your scheduled payments.
          </p>
        </div>
        <div className="inline-flex gap-1 rounded-full border border-border bg-surface-2 p-1">
          {HORIZONS.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setHorizon(h.id)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                horizon === h.id
                  ? "bg-surface text-foreground"
                  : "text-muted hover:text-foreground"
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
        aria-label="Projected bucket balances over time"
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

        {/* zero baseline emphasised when lines can go negative */}
        {yMin < 0 && (
          <line x1={PAD.left} x2={W - PAD.right} y1={yZero} y2={yZero} stroke="var(--muted)" strokeWidth={1} opacity={0.5} />
        )}

        {/* x labels */}
        {xTickIdx.map((idx) => {
          const d = timeline.dates[idx];
          if (!d) return null;
          return (
            <text key={idx} x={x(d.getTime())} y={H - 12} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {monthLabel(d)}
            </text>
          );
        })}

        {/* one line per bucket */}
        {buckets.map((b, bi) => {
          const series = timeline.buckets[b.id] ?? [];
          const color = CHART_COLORS[bi % CHART_COLORS.length];
          const path = series
            .map((v, i) => `${i === 0 ? "M" : "L"} ${x(timeline.dates[i].getTime()).toFixed(1)} ${y(v).toFixed(1)}`)
            .join(" ");
          return <path key={b.id} d={path} fill="none" stroke={color} strokeWidth={2.25} />;
        })}

        {/* hover scrubber */}
        {hover !== null && hoverDate && (
          <g>
            <line
              x1={x(hoverDate.getTime())}
              x2={x(hoverDate.getTime())}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="var(--muted)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            {buckets.map((b, bi) => {
              const v = timeline.buckets[b.id]?.[hover] ?? 0;
              return (
                <circle
                  key={b.id}
                  cx={x(hoverDate.getTime())}
                  cy={y(v)}
                  r={3.5}
                  fill={CHART_COLORS[bi % CHART_COLORS.length]}
                  stroke="var(--background)"
                  strokeWidth={1.5}
                />
              );
            })}
          </g>
        )}
      </svg>

      {/* legend + hover readout */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        {buckets.map((b, bi) => (
          <span key={b.id} className="inline-flex items-center gap-1.5 text-muted">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: CHART_COLORS[bi % CHART_COLORS.length] }}
            />
            {b.glyph} {b.name}
            {hover !== null && (
              <span className="text-foreground">
                {" "}
                · {money(timeline.buckets[b.id]?.[hover] ?? 0)}
              </span>
            )}
          </span>
        ))}
        {hoverDate && (
          <span className="ml-auto font-medium text-foreground">{dayLabel(hoverDate)}</span>
        )}
      </div>

      {timeline.anyShortfall && (
        <p className="mt-3 text-xs text-gold">
          ⚠️ A bucket dips below £0 within this window — a planned spend it isn&apos;t
          on track to cover.
        </p>
      )}
    </div>
  );
}
