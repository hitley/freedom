"use client";

import { useState } from "react";
import { DateInput, Field, MoneyInput, Select } from "@/components/forms/primitives";
import { WEEKDAYS, toISO } from "@/lib/buckets";
import {
  SPENDING_CATEGORIES,
  type RecurringExpense,
  type SpendingCategory,
} from "@/lib/spending";

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Cadence presets map the friendly "Quarterly" / "Fortnightly" labels users think
 * in onto the recurrence engine's `{ freq, interval }`. `base` decides whether the
 * row needs a day-of-month (monthly-based) or a weekday (weekly-based).
 */
const CADENCE_PRESETS = [
  { id: "weekly", label: "Weekly", freq: "weekly", interval: 1, base: "weekly" },
  { id: "fortnightly", label: "Fortnightly", freq: "weekly", interval: 2, base: "weekly" },
  { id: "monthly", label: "Monthly", freq: "monthly", interval: 1, base: "monthly" },
  { id: "quarterly", label: "Quarterly", freq: "monthly", interval: 3, base: "monthly" },
  { id: "halfyearly", label: "Half-yearly", freq: "monthly", interval: 6, base: "monthly" },
  { id: "yearly", label: "Yearly", freq: "monthly", interval: 12, base: "monthly" },
] as const;

type CadenceId = (typeof CADENCE_PRESETS)[number]["id"];

/** Best-fit preset for an existing recurrence (defaults to monthly). */
function presetOf(freq: string, interval: number): CadenceId {
  const hit = CADENCE_PRESETS.find((p) => p.freq === freq && p.interval === interval);
  return hit?.id ?? "monthly";
}

/** Spend categories only — a commitment is always money out, never income/transfer. */
const EXPENSE_CATEGORIES = SPENDING_CATEGORIES.filter((c) => c.spend);

/**
 * Add or edit a single **recurring expense** — a commitment in the bottom-up budget:
 * who's paid, the category, the expected amount per occurrence, whether that figure is
 * a known direct debit or an averaged guess, and how often it falls due. Renders as a
 * modal overlay; `onSave` returns the assembled `RecurringExpense` to the parent. The
 * cadence picker reuses the recurrence engine via friendly presets.
 */
export default function RecurringExpenseEditor({
  expense,
  existing,
  onSave,
  onDelete,
  onCancel,
}: {
  expense: RecurringExpense;
  /** True when editing an existing commitment (enables Delete). */
  existing: boolean;
  onSave: (expense: RecurringExpense) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}) {
  const rec = expense.recurrence;
  const [payee, setPayee] = useState(expense.payee);
  const [category, setCategory] = useState<SpendingCategory>(expense.category);
  const [estimate, setEstimate] = useState(
    expense.estimate ? String(expense.estimate) : "",
  );
  const [basis, setBasis] = useState<RecurringExpense["basis"]>(expense.basis);
  const [active, setActive] = useState(expense.active);
  const [cadence, setCadence] = useState<CadenceId>(
    presetOf(rec.freq, Math.max(1, rec.interval ?? 1)),
  );
  const [dayOfMonth, setDayOfMonth] = useState(rec.dayOfMonth ?? 1);
  const [weekday, setWeekday] = useState(rec.weekday ?? 1);
  const [startDate, setStartDate] = useState(rec.startDate || toISO(new Date()));

  const preset = CADENCE_PRESETS.find((p) => p.id === cadence)!;
  const canSave = payee.trim().length > 0 && num(estimate) > 0 && !!startDate;

  const save = () => {
    if (!canSave) return;
    onSave({
      ...expense,
      payee: payee.trim(),
      category,
      direction: "out",
      estimate: num(estimate),
      basis,
      active,
      recurrence: {
        freq: preset.freq,
        startDate,
        interval: preset.interval,
        ...(preset.base === "monthly"
          ? { dayOfMonth, weekday: undefined, endDate: undefined }
          : { weekday, dayOfMonth: undefined, endDate: undefined }),
      },
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
          {existing ? "Edit expense" : "New recurring expense"}
        </h2>

        <input
          autoFocus
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          maxLength={120}
          placeholder="British Gas"
          className="mt-5 w-full rounded-xl border border-border bg-surface px-4 py-3 font-display text-lg outline-none transition-colors placeholder:text-muted/50 focus:border-emerald"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Estimate (per payment)">
            <MoneyInput value={estimate} onChange={setEstimate} placeholder="120.00" />
          </Field>
          <Field label="Amount is">
            <div className="inline-flex w-full rounded-xl border border-border bg-surface p-0.5 text-sm">
              {(
                [
                  { id: "fixed", label: "Fixed" },
                  { id: "estimated", label: "Estimated" },
                ] as const
              ).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBasis(b.id)}
                  className={`flex-1 rounded-lg px-2 py-2 transition-colors ${
                    basis === b.id
                      ? "bg-surface-2 text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* cadence */}
        <div className="mt-4">
          <Field label="How often">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={cadence}
                onChange={(v) => setCadence(v as CadenceId)}
                options={CADENCE_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
              />
              {preset.base === "monthly" ? (
                <div className="inline-flex items-center gap-1 text-xs text-muted">
                  on day
                  <input
                    inputMode="numeric"
                    value={String(dayOfMonth)}
                    onChange={(e) =>
                      setDayOfMonth(
                        Math.min(
                          31,
                          Math.max(1, Number(e.target.value.replace(/[^0-9]/g, "")) || 1),
                        ),
                      )
                    }
                    className="w-12 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-emerald"
                  />
                </div>
              ) : (
                <Select
                  value={String(weekday)}
                  onChange={(v) => setWeekday(Number(v))}
                  options={WEEKDAYS.map((d) => ({ value: String(d.id), label: d.label }))}
                />
              )}
            </div>
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Starting">
            <DateInput value={startDate} onChange={setStartDate} />
          </Field>
        </div>

        {/* category */}
        <div className="mt-4">
          <Field label="Category">
            <div className="flex flex-wrap gap-1.5">
              {EXPENSE_CATEGORIES.map((c) => (
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

        {existing && (
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="accent-emerald"
            />
            Active — counts toward the budget
          </label>
        )}

        {/* actions */}
        <div className="mt-7 flex items-center justify-between">
          {existing ? (
            <button
              type="button"
              onClick={() => onDelete(expense.id)}
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
