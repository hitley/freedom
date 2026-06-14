import type { ProjectionPoint } from "@/lib/finance";

interface Props {
  series: ProjectionPoint[];
  magicNumber: number;
  monthsToFreedom: number | null;
  startYear: number;
}

const W = 820;
const H = 380;
const PAD = { top: 28, right: 28, bottom: 40, left: 68 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function money(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 2)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${Math.round(n)}`;
}

/**
 * Portfolio projection vs the magic number. The crossover — where growth meets
 * the target — is the emotional anchor: that's the freedom date.
 */
export default function ProjectionChart({
  series,
  magicNumber,
  monthsToFreedom,
  startYear,
}: Props) {
  const freedomYears = monthsToFreedom === null ? null : monthsToFreedom / 12;

  // Horizon: a little past the freedom point, or the whole series if never reached.
  const horizon =
    freedomYears === null
      ? series[series.length - 1].year
      : Math.min(series[series.length - 1].year, Math.ceil(freedomYears) + 5);

  const pts = series.filter((p) => p.year <= horizon);
  const lastValue = pts[pts.length - 1]?.value ?? 0;
  const yMax = Math.max(magicNumber, lastValue) * 1.08;

  const x = (year: number) => PAD.left + (year / horizon) * PLOT_W;
  const y = (value: number) => PAD.top + (1 - value / yMax) * PLOT_H;
  const baseline = PAD.top + PLOT_H;

  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.year).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${x(horizon).toFixed(1)} ${baseline} L ${x(0).toFixed(1)} ${baseline} Z`;

  const targetY = y(magicNumber);
  const reached = freedomYears !== null && freedomYears <= horizon;
  const fx = reached ? x(freedomYears!) : null;

  // Axis ticks.
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const xStep = horizon <= 12 ? 2 : horizon <= 30 ? 5 : 10;
  const xTicks: number[] = [];
  for (let yr = 0; yr <= horizon; yr += xStep) xTicks.push(yr);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Projected portfolio rising toward a magic number of ${money(
        magicNumber,
      )}${reached ? `, reaching it in ${startYear + Math.ceil(freedomYears!)}` : " (not reached within the horizon)"}.`}
      className="block"
    >
      <defs>
        <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--emerald)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--emerald)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* horizontal gridlines + y labels */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 12}
            y={y(v) + 4}
            textAnchor="end"
            fontSize={12}
            fill="var(--muted)"
          >
            {money(v)}
          </text>
        </g>
      ))}

      {/* x labels */}
      {xTicks.map((yr) => (
        <text
          key={yr}
          x={x(yr)}
          y={H - 12}
          textAnchor="middle"
          fontSize={12}
          fill="var(--muted)"
        >
          {startYear + yr}
        </text>
      ))}

      {/* magic-number target line */}
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={targetY}
        y2={targetY}
        stroke="var(--gold)"
        strokeWidth={1.5}
        strokeDasharray="6 5"
      />
      <text
        x={W - PAD.right}
        y={targetY - 8}
        textAnchor="end"
        fontSize={12}
        fill="var(--gold)"
        fontWeight={600}
      >
        Magic number · {money(magicNumber)}
      </text>

      {/* growth area + line */}
      <path d={areaPath} fill="url(#growthFill)" />
      <path d={linePath} fill="none" stroke="var(--emerald)" strokeWidth={2.5} />

      {/* crossover — the freedom moment */}
      {reached && fx !== null && (
        <g>
          <line
            x1={fx}
            x2={fx}
            y1={targetY}
            y2={baseline}
            stroke="var(--gold)"
            strokeWidth={1}
            strokeDasharray="3 4"
            opacity={0.6}
          />
          <circle cx={fx} cy={targetY} r={9} fill="var(--emerald)" opacity={0.25} />
          <circle cx={fx} cy={targetY} r={5} fill="var(--emerald)" stroke="var(--background)" strokeWidth={2} />
          <text
            x={fx}
            y={baseline + 28}
            textAnchor="middle"
            fontSize={12}
            fill="var(--emerald)"
            fontWeight={600}
          >
            {startYear + Math.ceil(freedomYears!)} · free
          </text>
        </g>
      )}
    </svg>
  );
}
