/**
 * Small UI primitives shared by the maximised **detail views** (holdings,
 * buckets, …). These were copy-pasted per detail component; they live here now
 * so every detail view reads the same. Pure presentational — no domain logic.
 */

/** A compact money label for chart axes/tooltips: £950, £1.2k, £3.4m. */
export function compactMoney(n: number): string {
  const abs = Math.abs(n);
  const s =
    abs >= 1_000_000
      ? `£${Math.round(abs / 100_000) / 10}m`
      : abs >= 1_000
        ? `£${Math.round(abs / 100) / 10}k`
        : `£${Math.round(abs)}`;
  return n < 0 ? `-${s}` : s;
}

/** A headline figure card (label, big value, optional hint). */
export function Stat({
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

/** A labelled range input with a live formatted readout — a what-if lever. */
export function Slider({
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
