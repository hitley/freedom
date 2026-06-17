"use client";

import { useMemo, useState } from "react";
import {
  DIVIDEND_FREQS,
  HOLDING_KINDS,
  holdingView,
  summarise,
  type Holding,
  type InvestmentsState,
  type Quote,
} from "@/lib/investments";
import HoldingEditor from "./HoldingEditor";

const gbp0 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const gbp2 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

const kindMeta = (id: string) => HOLDING_KINDS.find((k) => k.id === id);

/** A blank holding to seed the editor when adding (defaults to a market holding). */
const freshHolding = (): Holding => ({
  id: crypto.randomUUID(),
  name: "",
  kind: "etf",
  valuation: "market",
  ticker: "",
  units: 0,
  pricePerUnit: 0,
  expectedReturnPct: 5,
});

/**
 * The investments view: every freedom-generating holding — super, shares, ETFs —
 * with a live portfolio total, a breakdown by kind, and a one-year look-ahead
 * that folds in recurring contributions and reinvested dividends. Market holdings
 * are valued `units × price` (manual price for now; a live feed slots in via the
 * `PriceProvider` seam). State is owned by the parent and flows back up.
 */
export default function InvestmentsPanel({
  state,
  onChange,
  quotes,
}: {
  state: InvestmentsState;
  onChange: (next: InvestmentsState) => void;
  /** Live quotes by ticker; empty under the manual provider. */
  quotes?: Record<string, Quote>;
}) {
  // null = closed; a Holding = editing/adding that holding.
  const [editing, setEditing] = useState<Holding | null>(null);

  const summary = useMemo(() => summarise(state, quotes), [state, quotes]);
  const growth = summary.projectedValue1y - summary.totalValue;

  const saveHolding = (holding: Holding) => {
    const exists = state.holdings.some((h) => h.id === holding.id);
    onChange({
      holdings: exists
        ? state.holdings.map((h) => (h.id === holding.id ? holding : h))
        : [...state.holdings, holding],
    });
    setEditing(null);
  };

  const deleteHolding = (id: string) => {
    onChange({ holdings: state.holdings.filter((h) => h.id !== id) });
    setEditing(null);
  };

  return (
    <section>
      {/* summary */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Portfolio value" value={gbp0.format(summary.totalValue)} />
        <Stat
          label="Projected in 1 year"
          value={gbp0.format(summary.projectedValue1y)}
          accent="text-emerald"
          hint={`${growth >= 0 ? "+" : ""}${gbp0.format(growth)} from growth & contributions`}
        />
        <Stat
          label="Contributions / yr"
          value={gbp0.format(summary.annualContributions)}
          accent="text-gold"
          hint={
            summary.annualDividends > 0
              ? `+${gbp0.format(summary.annualDividends)} dividends reinvested`
              : undefined
          }
        />
      </div>

      {/* breakdown by kind */}
      {summary.totalValue > 0 && (
        <div className="mb-8 rounded-2xl border border-border bg-surface p-5">
          <div className="mb-3 text-[11px] uppercase tracking-wide text-muted">
            By type
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-border">
            {summary.byKind.map((k, i) => (
              <div
                key={k.kind}
                className={KIND_BAR[i % KIND_BAR.length]}
                style={{ width: `${(k.value / summary.totalValue) * 100}%` }}
                title={`${kindMeta(k.kind)?.label}: ${gbp0.format(k.value)}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {summary.byKind.map((k, i) => (
              <div key={k.kind} className="flex items-center gap-1.5 text-xs">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-sm ${KIND_DOT[i % KIND_DOT.length]}`}
                />
                <span className="text-muted">{kindMeta(k.kind)?.label}</span>
                <span className="text-foreground">{gbp0.format(k.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* holdings */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Holdings
        </h2>
        <button
          type="button"
          onClick={() => setEditing(freshHolding())}
          className="rounded-full bg-emerald px-4 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
        >
          + Add holding
        </button>
      </div>

      {state.holdings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center text-muted">
          No holdings yet. Add your super, shares, or ETFs to start tracking.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {state.holdings.map((holding) => {
            const v = holdingView(holding, quotes);
            const meta = kindMeta(holding.kind);
            const freq = holding.contribution?.recurrence.freq;
            return (
              <div
                key={holding.id}
                className="rounded-2xl border border-border bg-surface p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{meta?.glyph}</span>
                    <div>
                      <div className="font-display text-base font-semibold leading-tight">
                        {holding.name}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {holding.valuation === "market"
                          ? `${formatUnits(holding.units ?? 0)} @ ${gbp2.format(v.price ?? 0)}${v.priced ? " · live" : ""}`
                          : meta?.label}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(holding)}
                    className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-muted/50 hover:text-foreground"
                  >
                    Edit
                  </button>
                </div>

                <div className="mt-4 font-display text-2xl font-bold">
                  {gbp0.format(v.value)}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {v.annualContribution > 0 && freq && (
                    <Chip>
                      {gbp0.format(holding.contribution!.amount)} {freqLabel(freq)}
                    </Chip>
                  )}
                  {holding.drp && (
                    <Chip accent>
                      DRP · {holding.drp.annualYieldPct}% {drpFreqLabel(holding.drp.frequency)}
                    </Chip>
                  )}
                  {holding.expectedReturnPct ? (
                    <Chip>{holding.expectedReturnPct}% growth</Chip>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <HoldingEditor
          holding={editing}
          existing={state.holdings.some((h) => h.id === editing.id)}
          onSave={saveHolding}
          onDelete={deleteHolding}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  );
}

// Tailwind only exposes the base palette (emerald/gold/muted); shade with opacity.
const KIND_BAR = ["bg-emerald", "bg-gold", "bg-emerald/50", "bg-gold/50", "bg-muted"];
const KIND_DOT = KIND_BAR;

const formatUnits = (n: number) =>
  n.toLocaleString("en-GB", { maximumFractionDigits: 4 });

const freqLabel = (freq: string) =>
  freq === "weekly" ? "weekly" : freq === "monthly" ? "monthly" : "once";

const drpFreqLabel = (id: string) =>
  DIVIDEND_FREQS.find((f) => f.id === id)?.label.toLowerCase() ?? id;

function Chip({
  children,
  accent = false,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
        accent
          ? "border-emerald/40 bg-emerald/10 text-emerald"
          : "border-border bg-surface-2 text-muted"
      }`}
    >
      {children}
    </span>
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
