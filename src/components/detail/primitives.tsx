/**
 * Small UI primitives shared by the maximised **detail views** (holdings,
 * buckets, …). These were copy-pasted per detail component; they live here now
 * so every detail view reads the same. Pure presentational — no business logic.
 */

import { HOME_SYMBOL } from "@/lib/money";

/** A compact money label for chart axes/tooltips: A$950, A$1.2k, A$3.4m. */
export function compactMoney(n: number): string {
  const abs = Math.abs(n);
  const s =
    abs >= 1_000_000
      ? `${HOME_SYMBOL}${Math.round(abs / 100_000) / 10}m`
      : abs >= 1_000
        ? `${HOME_SYMBOL}${Math.round(abs / 100) / 10}k`
        : `${HOME_SYMBOL}${Math.round(abs)}`;
  return n < 0 ? `-${s}` : s;
}

/** A headline figure card (label, big value, optional hint, optional corner action). */
export function Stat({
  label,
  value,
  accent = "text-foreground",
  hint,
  action,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
  /** An optional top-right icon button, e.g. to jump to a related view. */
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="relative rounded-2xl border border-border bg-surface px-5 py-4">
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          aria-label={action.label}
          title={action.label}
          className="absolute right-2.5 top-2.5 rounded-md p-1 text-muted/50 transition-colors hover:bg-surface-2 hover:text-emerald"
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 17 17 7M7 7h10v10" />
          </svg>
        </button>
      )}
      <div className={`text-[11px] uppercase tracking-wide text-muted ${action ? "pr-6" : ""}`}>{label}</div>
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
