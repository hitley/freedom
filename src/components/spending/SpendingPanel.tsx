"use client";

import { useMemo, useState } from "react";
import { toISO } from "@/lib/buckets";
import {
  SPENDING_CATEGORIES,
  summarise,
  type SpendingState,
  type Transaction,
} from "@/lib/spending";
import TransactionEditor from "./TransactionEditor";

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

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

const catMeta = (id: string) =>
  SPENDING_CATEGORIES.find((c) => c.id === id) ?? SPENDING_CATEGORIES[0];

/** A blank transaction to seed the editor when adding (defaults to a spend today). */
const freshTransaction = (): Transaction => ({
  id: crypto.randomUUID(),
  date: toISO(new Date()),
  description: "",
  amount: 0,
  direction: "out",
  category: "uncategorised",
  source: { kind: "manual" },
});

/**
 * The spending view: the user's *observed* outgoings and income. Leads with the
 * **annualised spend** — what a year actually costs, scaled from the data's own
 * window and compared against the spend the vision targets — then a by-category
 * breakdown and the transaction list. Manual entry today; imported statement rows
 * will flow into the same list once the ingestion inbox lands. State is owned by
 * the parent and flows back up.
 */
export default function SpendingPanel({
  state,
  onChange,
  targetAnnualSpend,
}: {
  state: SpendingState;
  onChange: (next: SpendingState) => void;
  /** The annual spend the vision/engine targets, for an at-a-glance comparison. */
  targetAnnualSpend?: number;
}) {
  // null = closed; a Transaction = editing/adding it.
  const [editing, setEditing] = useState<Transaction | null>(null);

  const summary = useMemo(() => summarise(state), [state]);
  const { window } = summary;

  // How the annualised spend compares to the target the vision set, if both exist.
  const target = targetAnnualSpend ?? 0;
  const vsTarget =
    target > 0 && window.annualised > 0
      ? (window.annualised - target) / target
      : null;

  const rows = useMemo(
    () =>
      [...state.transactions].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
      ),
    [state.transactions],
  );

  const saveTransaction = (tx: Transaction) => {
    const exists = state.transactions.some((t) => t.id === tx.id);
    onChange({
      transactions: exists
        ? state.transactions.map((t) => (t.id === tx.id ? tx : t))
        : [...state.transactions, tx],
    });
    setEditing(null);
  };

  const deleteTransaction = (id: string) => {
    onChange({ transactions: state.transactions.filter((t) => t.id !== id) });
    setEditing(null);
  };

  return (
    <section>
      {/* summary */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Annualised spend"
          value={gbp0.format(window.annualised)}
          accent="text-emerald"
          hint={
            vsTarget === null
              ? window.days > 0
                ? `from ${window.days} days of data`
                : "no spend recorded yet"
              : `${Math.abs(vsTarget * 100) < 0.5 ? "on" : `${(Math.abs(vsTarget) * 100).toFixed(0)}% ${vsTarget > 0 ? "above" : "below"}`} your ${gbp0.format(target)} target`
          }
        />
        <Stat
          label="Spent"
          value={gbp0.format(summary.totalOut)}
          hint={
            window.fromDate && window.toDate
              ? `${dayMonth.format(parse(window.fromDate))} – ${dayMonth.format(parse(window.toDate))}`
              : "across all records"
          }
        />
        <Stat
          label="Income"
          value={gbp0.format(summary.totalIn)}
          accent="text-gold"
          hint={`net ${summary.net >= 0 ? "+" : ""}${gbp0.format(summary.net)}`}
        />
      </div>

      {/* breakdown by category */}
      {summary.totalOut > 0 && (
        <div className="mb-8 rounded-2xl border border-border bg-surface p-5">
          <div className="mb-3 text-[11px] uppercase tracking-wide text-muted">
            Where it goes
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-border">
            {summary.byCategory.map((c, i) => (
              <div
                key={c.category}
                className={CAT_BAR[i % CAT_BAR.length]}
                style={{ width: `${(c.amount / summary.totalOut) * 100}%` }}
                title={`${catMeta(c.category).label}: ${gbp0.format(c.amount)}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {summary.byCategory.map((c, i) => (
              <div key={c.category} className="flex items-center gap-1.5 text-xs">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-sm ${CAT_BAR[i % CAT_BAR.length]}`}
                />
                <span className="text-muted">
                  {catMeta(c.category).glyph} {catMeta(c.category).label}
                </span>
                <span className="text-foreground">{gbp0.format(c.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* transactions */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Transactions
        </h2>
        <button
          type="button"
          onClick={() => setEditing(freshTransaction())}
          className="rounded-full bg-emerald px-4 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
        >
          + Add transaction
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center text-muted">
          No transactions yet. Add what you spend to see what a year really costs.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {rows.map((tx, i) => {
            const meta = catMeta(tx.category);
            const out = tx.direction === "out";
            return (
              <button
                key={tx.id}
                type="button"
                onClick={() => setEditing(tx)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <span className="text-lg" aria-hidden>
                  {meta.glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">
                    {tx.description}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {dayMonth.format(parse(tx.date))} · {meta.label}
                    {tx.source.kind === "import" && " · imported"}
                  </div>
                </div>
                <span
                  className={`shrink-0 font-display text-sm font-semibold tabular-nums ${
                    out ? "text-foreground" : "text-emerald"
                  }`}
                >
                  {out ? "−" : "+"}
                  {gbp2.format(tx.amount)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {editing && (
        <TransactionEditor
          transaction={editing}
          existing={state.transactions.some((t) => t.id === editing.id)}
          onSave={saveTransaction}
          onDelete={deleteTransaction}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  );
}

/** Parse a `YYYY-MM-DD` date for display (local midnight, no timezone drift). */
function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// Tailwind only exposes the base palette (emerald/gold/muted); shade with opacity.
const CAT_BAR = [
  "bg-emerald",
  "bg-gold",
  "bg-emerald/60",
  "bg-gold/60",
  "bg-emerald/40",
  "bg-gold/40",
  "bg-muted",
];

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
