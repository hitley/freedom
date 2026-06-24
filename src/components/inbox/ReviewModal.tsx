"use client";

import { useMemo, useState } from "react";
import {
  proposedTransactionsSchema,
  SPENDING_CATEGORIES,
  type SpendingCategory,
  type Transaction,
} from "@/lib/spending";
import type { InboxItem } from "@/lib/inbox";

const gbp2 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

/** One draft under review: the transaction plus whether the user is keeping it. */
interface Row {
  tx: Transaction;
  keep: boolean;
}

/**
 * The Reconcile stage's review screen. Lists a proposal's draft transactions, lets the
 * user re-categorise or drop individual rows, then approve the rest into the spending
 * ledger. Nothing here mutates state until "Approve" — the parent's `onApprove` calls
 * the server action that appends to the ledger and marks the item `applied`.
 */
export default function ReviewModal({
  item,
  onApprove,
  onCancel,
}: {
  item: InboxItem;
  onApprove: (id: string, approved: Transaction[]) => Promise<void>;
  onCancel: () => void;
}) {
  const proposed = useMemo(() => {
    const result = proposedTransactionsSchema.safeParse(item.extracted);
    return result.success ? result.data.transactions : [];
  }, [item.extracted]);

  const [rows, setRows] = useState<Row[]>(() =>
    proposed.map((tx) => ({ tx: tx as Transaction, keep: true })),
  );
  const [busy, setBusy] = useState(false);

  const kept = rows.filter((r) => r.keep);
  const keptSpend = kept
    .filter((r) => r.tx.direction === "out" && r.tx.category !== "transfer")
    .reduce((sum, r) => sum + r.tx.amount, 0);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const setCategory = (i: number, category: SpendingCategory) =>
    setRows((prev) =>
      prev.map((r, j) => (j === i ? { ...r, tx: { ...r.tx, category } } : r)),
    );

  const approve = async () => {
    if (kept.length === 0 || busy) return;
    setBusy(true);
    try {
      await onApprove(item.id, kept.map((r) => r.tx));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-6">
          <h2 className="font-display text-xl font-bold">Review “{item.label}”</h2>
          <p className="mt-1 text-sm text-muted">
            {proposed.length} new transaction{proposed.length === 1 ? "" : "s"} from this
            import. Tweak categories or drop any, then add them to your spending.
          </p>
        </div>

        {/* rows */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted">
              Nothing left to review — this import had no new transactions.
            </div>
          ) : (
            rows.map((row, i) => (
              <div
                key={row.tx.id}
                className={`flex items-center gap-3 border-b border-border px-4 py-3 ${
                  row.keep ? "" : "opacity-40"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm ${row.keep ? "" : "line-through"}`}>
                    {row.tx.description}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {dayMonth.format(parse(row.tx.date))}
                  </div>
                </div>

                <select
                  value={row.tx.category}
                  onChange={(e) => setCategory(i, e.target.value as SpendingCategory)}
                  disabled={!row.keep}
                  className="shrink-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-foreground outline-none focus:border-emerald disabled:opacity-50"
                >
                  {SPENDING_CATEGORIES.filter((c) =>
                    row.tx.direction === "in"
                      ? c.id === "income" || c.id === "transfer" || c.id === "uncategorised"
                      : c.id !== "income",
                  ).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.glyph} {c.label}
                    </option>
                  ))}
                </select>

                <span
                  className={`w-20 shrink-0 text-right font-display text-sm font-semibold tabular-nums ${
                    row.tx.direction === "out" ? "text-foreground" : "text-emerald"
                  }`}
                >
                  {row.tx.direction === "out" ? "−" : "+"}
                  {gbp2.format(row.tx.amount)}
                </span>

                <button
                  type="button"
                  onClick={() => setRow(i, { keep: !row.keep })}
                  aria-label={row.keep ? "Drop" : "Restore"}
                  className="shrink-0 rounded-full px-2 py-1 text-xs text-muted transition-colors hover:text-gold"
                >
                  {row.keep ? "Drop" : "Restore"}
                </button>
              </div>
            ))
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border p-4">
          <span className="text-xs text-muted">
            {kept.length} to add · {gbp2.format(keptSpend)} spend
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-4 py-2 text-sm text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={kept.length === 0 || busy}
              className="rounded-full bg-emerald px-6 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Adding…" : `Add ${kept.length} to spending`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
