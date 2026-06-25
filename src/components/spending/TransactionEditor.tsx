"use client";

import { useState } from "react";
import { Field, MoneyInput } from "@/components/forms/primitives";
import { toISO } from "@/lib/buckets";
import {
  SPENDING_CATEGORIES,
  type Direction,
  type SpendingCategory,
  type Transaction,
} from "@/lib/spending";

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Add or edit a single transaction: what it was, how much, which way the money
 * moved, its category, and when. Renders as a modal overlay; `onSave` returns the
 * assembled `Transaction` to the parent. Provenance (`source`) is preserved as-is,
 * so editing an imported row keeps its link back to the statement it came from.
 */
export default function TransactionEditor({
  transaction,
  existing,
  onSave,
  onDelete,
  onCancel,
}: {
  transaction: Transaction;
  /** True when editing an existing transaction (enables Delete). */
  existing: boolean;
  onSave: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(transaction.description);
  const [amount, setAmount] = useState(
    transaction.amount ? String(transaction.amount) : "",
  );
  const [direction, setDirection] = useState<Direction>(transaction.direction);
  const [category, setCategory] = useState<SpendingCategory>(transaction.category);
  const [date, setDate] = useState(transaction.date || toISO(new Date()));

  const canSave = description.trim().length > 0 && num(amount) > 0 && !!date;

  const save = () => {
    if (!canSave) return;
    onSave({
      ...transaction,
      description: description.trim(),
      amount: num(amount),
      direction,
      category,
      date,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-surface p-6 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-bold">
          {existing ? "Edit transaction" : "New transaction"}
        </h2>

        {/* direction */}
        <div className="mt-5">
          <Field label="Direction">
            <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm">
              {(
                [
                  { id: "out", label: "Money out" },
                  { id: "in", label: "Money in" },
                ] as const
              ).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDirection(d.id)}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    direction === d.id
                      ? "bg-surface-2 text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <input
          autoFocus
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          placeholder={direction === "out" ? "Tesco" : "Salary"}
          className="mt-4 w-full rounded-xl border border-border bg-surface px-4 py-3 font-display text-lg outline-none transition-colors placeholder:text-muted/50 focus:border-emerald"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Amount">
            <MoneyInput value={amount} onChange={setAmount} placeholder="50.00" />
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none transition-colors focus:border-emerald"
            />
          </Field>
        </div>

        {/* category */}
        <div className="mt-4">
          <Field label="Category">
            <div className="flex flex-wrap gap-1.5">
              {SPENDING_CATEGORIES.filter((c) =>
                // Income is its own direction; transfers apply either way.
                direction === "in"
                  ? c.id === "income" || c.id === "transfer" || c.id === "uncategorised"
                  : c.id !== "income",
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm transition-colors ${
                    category === c.id
                      ? "border-emerald bg-emerald/10"
                      : "border-border bg-surface hover:border-muted/50"
                  }`}
                >
                  <span aria-hidden>{c.glyph}</span>
                  {c.label}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {transaction.source.kind === "import" && (
          <div className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-xs text-muted">
            Imported from a statement — edits won&apos;t break the link back to its source.
          </div>
        )}

        {/* actions */}
        <div className="mt-7 flex items-center justify-between">
          {existing ? (
            <button
              type="button"
              onClick={() => onDelete(transaction.id)}
              className="rounded-full px-3 py-2 text-sm text-muted transition-colors hover:text-gold"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
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
              onClick={save}
              disabled={!canSave}
              className="rounded-full bg-emerald px-6 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
