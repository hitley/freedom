"use client";

import { useRef, useState } from "react";
import { compactMoney } from "./primitives";

/** A plottable point: a timestamp (ms) and a value. */
export interface ChartPoint {
  t: number;
  v: number;
}

/** Which of the two series the cursor is nearest. */
type SeriesKind = "actual" | "projected";

const W = 820;
const H = 320;
const PAD = { top: 20, right: 20, bottom: 32, left: 64 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const ACTUAL_COLOR = "#f5be4a"; // gold — the recorded past
const PROJECTED_COLOR = "#34d399"; // emerald — the projection

const yearLabel = (d: Date) => d.toLocaleDateString("en-GB", { year: "numeric" });

/**
 * A generic **past & projected** timeline chart. Give it recorded actuals (drawn
 * solid with point markers, left of "today") and a forward projection (dashed,
 * right of today) and it handles the scales, gridlines, today divider, an
 * optional horizontal reference line (e.g. a goal), and a hover scrubber that
 * snaps to the nearest point of either series. The tooltip text is domain-specific,
 * so the caller supplies `tooltipLines(series, idx)` — line 0 renders muted, line
 * 1 bold, the rest plain.
 */
export default function ProjectionChart({
  today,
  actual = [],
  projected,
  title,
  subtitle,
  headerRight,
  actualLabel = "Recorded",
  projectedLabel = "Projected",
  reference,
  tooltipLines,
  ariaLabel,
}: {
  today: Date;
  actual?: ChartPoint[];
  projected: ChartPoint[];
  title: string;
  subtitle?: string;
  /** Slot at the top-right of the card — typically a horizon selector. */
  headerRight?: React.ReactNode;
  actualLabel?: string;
  projectedLabel?: string;
  /** An optional horizontal marker line, e.g. a bucket's target. */
  reference?: { value: number; label: string };
  tooltipLines: (series: SeriesKind, idx: number) => string[];
  ariaLabel?: string;
}) {
  const [hover, setHover] = useState<{ series: SeriesKind; idx: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Range spans the earliest record (if any) through the projection end.
  const t0 = Math.min(actual[0]?.t ?? today.getTime(), today.getTime());
  const t1 = projected[projected.length - 1]?.t ?? today.getTime();
  const span = Math.max(1, t1 - t0);
  const yMax =
    Math.max(
      1,
      ...actual.map((a) => a.v),
      ...projected.map((p) => p.v),
      reference?.value ?? 0,
    ) * 1.08;

  const x = (t: number) => PAD.left + ((t - t0) / span) * PLOT_W;
  const y = (v: number) => PAD.top + (1 - v / yMax) * PLOT_H;

  const projPath = projected
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(" ");
  const actualPath = actual
    .map((a, i) => `${i === 0 ? "M" : "L"} ${x(a.t).toFixed(1)} ${y(a.v).toFixed(1)}`)
    .join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const xTicks = Array.from({ length: 6 }, (_, i) => t0 + (i / 5) * span);

  // Every hoverable point, across both series, for the scrubber to snap to.
  const allPoints = [
    ...actual.map((a, i) => ({ ...a, series: "actual" as const, idx: i })),
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
        ? actual[hover.idx]
        : projected[hover.idx];

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {headerRight}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="block"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={ariaLabel ?? title}
      >
        {/* gridlines + y labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 10} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {compactMoney(v)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--muted)">
            {yearLabel(new Date(t))}
          </text>
        ))}

        {/* reference line (e.g. a goal) */}
        {reference && reference.value <= yMax && (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(reference.value)}
              y2={y(reference.value)}
              stroke={PROJECTED_COLOR}
              strokeWidth={1}
              strokeDasharray="2 4"
              opacity={0.7}
            />
            <text x={W - PAD.right} y={y(reference.value) - 5} textAnchor="end" fontSize={10} fill={PROJECTED_COLOR}>
              {reference.label}
            </text>
          </g>
        )}

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
        <path d={projPath} fill="none" stroke={PROJECTED_COLOR} strokeWidth={2.25} strokeDasharray="5 4" />

        {/* actual (past) — solid gold with point markers */}
        {actual.length > 0 && (
          <>
            <path d={actualPath} fill="none" stroke={ACTUAL_COLOR} strokeWidth={2.5} />
            {actual.map((a, i) => (
              <circle key={i} cx={x(a.t)} cy={y(a.v)} r={3.5} fill={ACTUAL_COLOR} stroke="var(--background)" strokeWidth={1.5} />
            ))}
          </>
        )}

        {/* hover scrubber: vertical line, highlighted marker, value tooltip */}
        {hover && hovered && (() => {
          const hx = x(hovered.t);
          const hy = y(hovered.v);
          const color = hover.series === "actual" ? ACTUAL_COLOR : PROJECTED_COLOR;
          const lines = tooltipLines(hover.series, hover.idx);
          if (lines.length === 0) return null;

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
        {actual.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ACTUAL_COLOR }} />
            {actualLabel}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: PROJECTED_COLOR }} />
          {projectedLabel}
        </span>
      </div>
    </div>
  );
}

/** A pill-style horizon selector, the usual `headerRight` for a {@link ProjectionChart}. */
export function HorizonSelector<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-full border border-border bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
            value === o.id ? "bg-surface text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
