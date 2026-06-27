"use client";

import { useMemo } from "react";
import { addMonths, startOfDay } from "@/lib/buckets";
import {
  reconcileWindow,
  SPENDING_CATEGORIES,
  suggestMatches,
  type ReconciledOccurrence,
  type SpendingState,
  type Transaction,
} from "@/lib/spending";

const gbp2 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

const catMeta = (id: string) =>
  SPENDING_CATEGORIES.find((c) => c.id === id) ?? SPENDING_CATEGORIES[0];

/** Parse a `YYYY-MM-DD` for display (local midnight, no timezone drift). */
function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * The **reconcile view**: expected occurrences over the recent window paired with the
 * actuals that settled them. Matched rows show the variance; unmatched rows surface a
 * *suggested* actual to confirm (never auto-applied) — confirming stamps
 * `transaction.recurring` on that transaction via `onChange`. Overdue occurrences with
 * no candidate are highlighted so the user can see what's still outstanding. Renders as
 * a modal overlay over the Spending panel.
 */
export default function ReconcileModal({
  state,
  onChange,
  onClose,
}: {
  state: SpendingState;
  onChange: (next: SpendingState) => void;
  onClose: () => void;
}) {
  // Look back two months through the end of the current month — where actuals live.
  const today = startOfDay(new Date());
  const from = addMonths(today, -2);
  const to = addMonths(today, 1);

  const view = useMemo(
    () => reconcileWindow(state, from, to, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  );

  // Newest occurrence first reads more naturally for a "what just happened" review.
  const rows = useMemo(
    () => [...view.occurrences].sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1)),
    [view.occurrences],
  );

  const expenseFor = (id: string) => state.recurring.find((e) => e.id === id);

  /** Best suggested actual for an unmatched occurrence, or null. */
  const suggestionFor = (occ: ReconciledOccurrence): Transaction | null => {
    const expense = expenseFor(occ.expenseId);
    if (!expense) return null;
    return suggestMatches(expense, occ.dueDate, state.transactions)[0]?.transaction ?? null;
  };

  const link = (txId: string, expenseId: string, dueDate: string) =>
    onChange({
      ...state,
      transactions: state.transactions.map((t) =>
        t.id === txId ? { ...t, recurring: { expenseId, dueDate } } : t,
      ),
    });

  const unlink = (txId: string) =>
    onChange({
      ...state,
      transactions: state.transactions.map((t) =>
        t.id === txId ? { ...t, recurring: undefined } : t,
      ),
    });

  const matchedCount = rows.filter((r) => r.status === "matched").length;
  const overdueCount = rows.filter((r) => r.status === "overdue").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface p-6 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-bold">Reconcile</h2>
            <p className="mt-1 text-sm text-muted">
              {matchedCount} matched · {overdueCount} outstanding · last 2 months
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            Done
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center text-muted">
            No expected payments in this window. Add recurring expenses to reconcile your
            bills against what you planned.
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            {rows.map((occ) => {
              const meta = catMeta(occ.category);
              const suggestion = occ.status !== "matched" ? suggestionFor(occ) : null;
              return (
                <div
                  key={`${occ.expenseId}-${occ.dueDate}`}
                  className={`rounded-xl border bg-surface-2 p-3 ${
                    occ.status === "overdue" && !suggestion
                      ? "border-gold/40"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg" aria-hidden>
                      {meta.glyph}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-foreground">{occ.payee}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        due {dayMonth.format(parse(occ.dueDate))} · {gbp2.format(occ.estimate)}
                      </div>
                    </div>
                    <StatusChip occ={occ} />
                  </div>

                  {/* matched: show the actual + unlink */}
                  {occ.status === "matched" && occ.actual && (
                    <div className="mt-2 flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs">
                      <span className="min-w-0 truncate text-muted">
                        {occ.actual.description} ·{" "}
                        {dayMonth.format(parse(occ.actual.date))}
                      </span>
                      <button
                        type="button"
                        onClick={() => unlink(occ.actual!.id)}
                        className="ml-2 shrink-0 text-muted transition-colors hover:text-gold"
                      >
                        Unlink
                      </button>
                    </div>
                  )}

                  {/* unmatched: suggest a candidate to confirm */}
                  {suggestion && (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-emerald/30 bg-emerald/5 px-3 py-2 text-xs">
                      <span className="min-w-0 truncate text-foreground">
                        Looks like{" "}
                        <span className="font-medium">{suggestion.description}</span> ·{" "}
                        {gbp2.format(suggestion.amount)} ·{" "}
                        {dayMonth.format(parse(suggestion.date))}
                      </span>
                      <button
                        type="button"
                        onClick={() => link(suggestion.id, occ.expenseId, occ.dueDate)}
                        className="shrink-0 rounded-full bg-emerald px-3 py-1 font-semibold text-background transition-opacity hover:opacity-90"
                      >
                        Confirm
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {view.unmatchedActuals.length > 0 && (
          <p className="mt-4 text-xs text-muted">
            {view.unmatchedActuals.length} other transaction
            {view.unmatchedActuals.length === 1 ? "" : "s"} in this window aren&apos;t tied
            to a commitment — discretionary spend, or a bill you haven&apos;t added yet.
          </p>
        )}
      </div>
    </div>
  );
}

function StatusChip({ occ }: { occ: ReconciledOccurrence }) {
  if (occ.status === "matched") {
    const v = occ.variance ?? 0;
    const onBudget = Math.abs(v) < 0.005;
    return (
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          onBudget
            ? "bg-emerald/15 text-emerald"
            : v > 0
              ? "bg-gold/15 text-gold"
              : "bg-emerald/15 text-emerald"
        }`}
      >
        {onBudget
          ? "on budget"
          : `${v > 0 ? "+" : "−"}${gbp2.format(Math.abs(v))}`}
      </span>
    );
  }
  if (occ.status === "overdue") {
    return (
      <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold">
        outstanding
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-muted/15 px-2 py-0.5 text-[11px] font-medium text-muted">
      upcoming
    </span>
  );
}
