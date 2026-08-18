"use client";

import { useMemo, useState } from "react";
import {
  convertHolding,
  convertToHome,
  DIVIDEND_FREQS,
  HOLDING_KINDS,
  holdingValue,
  holdingView,
  summarise,
  type Holding,
  type InvestmentsState,
  type Quote,
} from "@/lib/investments";
import { formatMoney, HOME_CURRENCY } from "@/lib/money";
import type { FxState } from "./useFxRates";
import HoldingEditor from "./HoldingEditor";
import HoldingDetail from "./HoldingDetail";
import PortfolioDetail from "./PortfolioDetail";
import { DRAG_HANDLE_CLASS, useReorder } from "../useReorder";

const money0 = (n: number) => formatMoney(n, HOME_CURRENCY, 0);
const money2 = (n: number) => formatMoney(n, HOME_CURRENCY, 2);

/** The foreign currency a holding is recorded in, or null when it's home-currency. */
const foreignCurrency = (h: Holding) =>
  h.currency && h.currency.toUpperCase() !== HOME_CURRENCY ? h.currency.toUpperCase() : null;

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
  fx,
  magicNumber,
}: {
  state: InvestmentsState;
  onChange: (next: InvestmentsState) => void;
  /** Live quotes by ticker; empty under the manual provider. */
  quotes?: Record<string, Quote>;
  /** Live FX rates + status; foreign-currency holdings convert to the home currency. */
  fx?: FxState;
  /** Freedom target (magic number), drawn as a reference line in the portfolio projection. */
  magicNumber?: number | null;
}) {
  // null = closed; a Holding = editing/adding that holding.
  const [editing, setEditing] = useState<Holding | null>(null);
  // null = overview; a holding id = its maximised detail view.
  const [detailId, setDetailId] = useState<string | null>(null);
  // Maximised whole-portfolio projection view.
  const [showPortfolio, setShowPortfolio] = useState(false);

  const rates = fx?.rates;
  // Everything totalled/charted uses home-currency amounts; editing uses the raw
  // (possibly foreign) state so the entered figures round-trip untouched.
  const homeState = useMemo(() => convertToHome(state, rates), [state, rates]);
  const summary = useMemo(() => summarise(homeState, quotes), [homeState, quotes]);
  const growth = summary.projectedValue1y - summary.totalValue;
  const hasForeign = state.holdings.some((h) => foreignCurrency(h));
  // A holding's value in its own currency (before conversion), for the native subtext.
  const rawValue = (h: Holding) => holdingValue(h, quotes);

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
    if (detailId === id) setDetailId(null);
  };

  // Drag-to-reorder the holdings; the new order persists like any other edit.
  const reorder = useReorder(
    state.holdings,
    (h) => h.id,
    (holdings) => onChange({ holdings }),
  );

  // Maximised whole-portfolio projection. Uses the home-currency state so its
  // baseline reconciles with the summary's "Projected in 1 year".
  if (showPortfolio) {
    return (
      <PortfolioDetail
        state={homeState}
        quotes={quotes}
        magicNumber={magicNumber}
        onClose={() => setShowPortfolio(false)}
      />
    );
  }

  // Maximised single-holding view. The editor can still open on top of it.
  const detailHolding = state.holdings.find((h) => h.id === detailId);
  if (detailHolding) {
    return (
      <>
        <HoldingDetail
          holding={convertHolding(detailHolding, rates)}
          quotes={quotes}
          onEdit={() => setEditing(detailHolding)}
          onClose={() => setDetailId(null)}
        />
        {editing && (
          <HoldingEditor
            holding={editing}
            existing={state.holdings.some((h) => h.id === editing.id)}
            onSave={saveHolding}
            onDelete={deleteHolding}
            onCancel={() => setEditing(null)}
          />
        )}
      </>
    );
  }

  return (
    <section>
      {/* summary */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Portfolio value" value={money0(summary.totalValue)} />
        <Stat
          label="Projected in 1 year"
          value={money0(summary.projectedValue1y)}
          accent="text-emerald"
          hint={`${growth >= 0 ? "+" : ""}${money0(growth)} from growth & contributions`}
          onClick={state.holdings.length > 0 ? () => setShowPortfolio(true) : undefined}
          tooltip={state.holdings.length > 0 ? "Explore across horizons" : undefined}
        />
        <Stat
          label="Contributions / yr"
          value={money0(summary.annualContributions)}
          accent="text-gold"
          hint={
            summary.annualDividends > 0
              ? `+${money0(summary.annualDividends)} dividends reinvested`
              : undefined
          }
        />
      </div>

      {/* FX status — shown only when a holding is in a foreign currency */}
      {hasForeign && <FxNote fx={fx} />}

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
                title={`${kindMeta(k.kind)?.label}: ${money0(k.value)}`}
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
                <span className="text-foreground">{money0(k.value)}</span>
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
          {reorder.orderedItems.map((holding) => {
            const v = holdingView(convertHolding(holding, rates), quotes);
            const meta = kindMeta(holding.kind);
            const freq = holding.contribution?.recurrence.freq;
            const fc = foreignCurrency(holding);
            const isDragging = reorder.dragId === holding.id;
            return (
              <div
                key={holding.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailId(holding.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailId(holding.id);
                  }
                }}
                {...reorder.itemProps(holding.id)}
                className={`group cursor-pointer rounded-2xl border p-5 hover:border-muted/50 ${
                  isDragging
                    ? "border-dashed border-emerald/60 bg-emerald/5 opacity-70 shadow-lg"
                    : "border-border bg-surface"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      aria-label={`Reorder ${holding.name || "holding"}`}
                      title="Drag to reorder (or focus and use arrow keys)"
                      className={`${DRAG_HANDLE_CLASS} opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
                      {...reorder.handleProps(holding.id)}
                    >
                      ⠿
                    </button>
                    <span className="text-2xl">{meta?.glyph}</span>
                    <div>
                      <div className="font-display text-base font-semibold leading-tight">
                        {holding.name}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {holding.valuation === "market"
                          ? `${formatUnits(holding.units ?? 0)} @ ${money2(v.price ?? 0)}${v.priced ? " · live" : ""}`
                          : meta?.label}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(holding);
                    }}
                    className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-muted/50 hover:text-foreground"
                  >
                    Edit
                  </button>
                </div>

                <div className="mt-4 font-display text-2xl font-bold">
                  {money0(v.value)}
                </div>
                {fc && (
                  <div className="mt-1 text-xs text-muted">
                    {formatMoney(rawValue(holding), fc, 0)} {fc}
                    {rates?.[fc]
                      ? ` · 1 ${fc} = ${money2(rates[fc])}`
                      : " · rate pending"}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {v.annualContribution > 0 && freq && (
                    <Chip>
                      {formatMoney(holding.contribution!.amount, fc ?? HOME_CURRENCY, 0)}{" "}
                      {freqLabel(freq)}
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

/** A one-line FX status: the rate(s) in use, when they're from, and offline state. */
function FxNote({ fx }: { fx?: FxState }) {
  const rates = fx?.rates ?? {};
  const pairs = Object.entries(rates);
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface-2 px-4 py-2 text-xs text-muted">
      <span>Converted to {HOME_CURRENCY} at</span>
      {pairs.length > 0 ? (
        pairs.map(([cur, rate]) => (
          <span key={cur} className="text-foreground">
            1 {cur} = {money2(rate)}
          </span>
        ))
      ) : (
        <span className="text-foreground">the latest rate…</span>
      )}
      {fx?.asOf && !fx.offline && <span>· as of {fx.asOf}</span>}
      {fx?.offline && (
        <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-gold">
          offline · using last saved rate
        </span>
      )}
      {fx?.loading && <span>· refreshing…</span>}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = "text-foreground",
  hint,
  onClick,
  tooltip,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
  /** When set, the stat becomes a button (e.g. to maximise into a detail view). */
  onClick?: () => void;
  /** Hover tooltip for the maximise icon; also the stat's accessible affordance. */
  tooltip?: string;
}) {
  const body = (
    <>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${accent}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group relative rounded-2xl border border-border bg-surface px-5 py-4 pr-10 text-left transition-colors hover:border-emerald/50"
      >
        {body}
        {tooltip && <span className="sr-only"> — {tooltip}</span>}
        <span className="group/tip absolute right-2.5 top-2.5">
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
            className="text-muted/40 transition-colors group-hover:text-emerald"
          >
            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
          {tooltip && (
            <span
              role="tooltip"
              className="pointer-events-none absolute right-0 top-7 z-10 whitespace-nowrap rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-normal text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100"
            >
              {tooltip}
            </span>
          )}
        </span>
      </button>
    );
  }
  return <div className="rounded-2xl border border-border bg-surface px-5 py-4">{body}</div>;
}
