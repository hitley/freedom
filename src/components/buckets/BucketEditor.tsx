"use client";

import { useState } from "react";
import {
  DateInput,
  Field,
  MoneyInput,
  Select,
} from "@/components/forms/primitives";
import {
  BUCKET_GLYPHS,
  WEEKDAYS,
  toISO,
  type Account,
  type Bucket,
  type Cashflow,
} from "@/lib/buckets";

const gbp0 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const todayISO = () => toISO(new Date());

/** A blank scheduled payment to seed a new row. */
const freshCashflow = (): Cashflow => ({
  id: crypto.randomUUID(),
  label: "",
  kind: "in",
  amount: 0,
  recurrence: { freq: "monthly", startDate: todayISO(), dayOfMonth: 1 },
});

/**
 * Add or edit a single bucket: its name, icon, goal (amount + optional
 * deadline), the allocation slices that make up its balance today, and the
 * scheduled payments that move money in and out over time. Renders as a modal
 * overlay; `onSave` returns the assembled `Bucket` to the parent.
 */
export default function BucketEditor({
  bucket,
  accounts,
  existing,
  onSave,
  onDelete,
  onCancel,
}: {
  bucket: Bucket;
  accounts: Account[];
  /** True when editing an existing bucket (enables Delete). */
  existing: boolean;
  onSave: (bucket: Bucket) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(bucket.name);
  const [glyph, setGlyph] = useState(bucket.glyph);
  const [target, setTarget] = useState<string>(
    bucket.target ? String(bucket.target) : "",
  );
  const [targetDate, setTargetDate] = useState<string>(bucket.targetDate ?? "");
  const [cashflows, setCashflows] = useState<Cashflow[]>(bucket.cashflows);
  // Allocation amount per account, keyed by account id.
  const [alloc, setAlloc] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const a of bucket.allocations) {
      if (a.amount) init[a.accountId] = String(a.amount);
    }
    return init;
  });

  const num = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const allocated = accounts.reduce((s, a) => s + num(alloc[a.id] ?? ""), 0);
  const canSave = name.trim().length > 0;

  const updateFlow = (next: Cashflow) =>
    setCashflows((prev) => prev.map((c) => (c.id === next.id ? next : c)));
  const removeFlow = (id: string) =>
    setCashflows((prev) => prev.filter((c) => c.id !== id));

  const save = () => {
    if (!canSave) return;
    const allocations = accounts
      .map((a) => ({ accountId: a.id, amount: num(alloc[a.id] ?? "") }))
      .filter((a) => a.amount > 0);
    onSave({
      id: bucket.id,
      name: name.trim(),
      glyph,
      target: num(target) > 0 ? num(target) : undefined,
      targetDate: targetDate || undefined,
      allocations,
      cashflows: cashflows.map((c) => ({
        ...c,
        label: c.label.trim() || (c.kind === "in" ? "Saving" : "Spend"),
      })),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface p-6 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-bold">
          {existing ? "Edit bucket" : "New bucket"}
        </h2>

        {/* glyph */}
        <div className="mt-5 flex flex-wrap gap-1.5">
          {BUCKET_GLYPHS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGlyph(g)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors ${
                glyph === g
                  ? "border-emerald bg-emerald/10"
                  : "border-border bg-surface hover:border-muted/50"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Emergency fund"
          className="mt-4 w-full rounded-xl border border-border bg-surface px-4 py-3 font-display text-lg outline-none transition-colors placeholder:text-muted/50 focus:border-emerald"
        />

        {/* target amount + deadline */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Target (optional)">
            <MoneyInput value={target} onChange={setTarget} placeholder="10000" />
          </Field>
          <Field label="Target by (optional)">
            <DateInput value={targetDate} onChange={setTargetDate} />
          </Field>
        </div>

        {/* allocations */}
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium">Where the money sits today</span>
            <span className="text-sm text-muted">{gbp0.format(allocated)} total</span>
          </div>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted">
              Add an account first to allocate money to this bucket.
            </p>
          ) : (
            <div className="space-y-2">
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">{a.name}</div>
                    <div className="text-xs text-muted">
                      holds {gbp0.format(a.balance)}
                    </div>
                  </div>
                  <div className="w-32 shrink-0">
                    <MoneyInput
                      value={alloc[a.id] ?? ""}
                      onChange={(v) => setAlloc((prev) => ({ ...prev, [a.id]: v }))}
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* scheduled payments */}
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium">Scheduled payments</span>
            <span className="text-xs text-muted">money in & out over time</span>
          </div>
          <div className="space-y-3">
            {cashflows.map((cf) => (
              <CashflowRow
                key={cf.id}
                flow={cf}
                accounts={accounts}
                onChange={updateFlow}
                onRemove={() => removeFlow(cf.id)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCashflows((prev) => [...prev, freshCashflow()])}
            className="mt-3 w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted transition-colors hover:border-muted/50 hover:text-foreground"
          >
            + Add payment
          </button>
        </div>

        {/* actions */}
        <div className="mt-7 flex items-center justify-between">
          {existing ? (
            <button
              type="button"
              onClick={() => onDelete(bucket.id)}
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

/** A single editable scheduled-payment row. */
function CashflowRow({
  flow,
  accounts,
  onChange,
  onRemove,
}: {
  flow: Cashflow;
  accounts: Account[];
  onChange: (next: Cashflow) => void;
  onRemove: () => void;
}) {
  const rec = flow.recurrence;
  const set = (patch: Partial<Cashflow>) => onChange({ ...flow, ...patch });
  const setRec = (patch: Partial<typeof rec>) =>
    onChange({ ...flow, recurrence: { ...rec, ...patch } });

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <input
          value={flow.label}
          onChange={(e) => set({ label: e.target.value })}
          maxLength={80}
          placeholder="e.g. Weekly saving"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted/50 focus:border-emerald"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove payment"
          className="shrink-0 rounded-lg px-2 py-2 text-sm text-muted transition-colors hover:text-gold"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* in / out */}
        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs">
          {(["in", "out"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => set({ kind: k, drain: k === "in" ? false : flow.drain })}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                flow.kind === k
                  ? k === "in"
                    ? "bg-emerald/15 text-emerald"
                    : "bg-gold/15 text-gold"
                  : "text-muted"
              }`}
            >
              {k === "in" ? "In" : "Out"}
            </button>
          ))}
        </div>

        {/* amount, unless draining */}
        {!(flow.kind === "out" && flow.drain) && (
          <div className="w-28">
            <MoneyInput
              value={flow.amount ? String(flow.amount) : ""}
              onChange={(v) => set({ amount: Number(v) || 0 })}
              placeholder="0"
            />
          </div>
        )}

        {/* spend-all toggle, out only */}
        {flow.kind === "out" && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={!!flow.drain}
              onChange={(e) => set({ drain: e.target.checked })}
              className="accent-gold"
            />
            spend all
          </label>
        )}
      </div>

      {/* frequency + schedule detail */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select
          value={rec.freq}
          onChange={(v) => setRec({ freq: v as typeof rec.freq })}
          options={[
            { value: "once", label: "Once" },
            { value: "weekly", label: "Weekly" },
            { value: "monthly", label: "Monthly" },
          ]}
        />

        {rec.freq === "weekly" && (
          <Select
            value={String(rec.weekday ?? 5)}
            onChange={(v) => setRec({ weekday: Number(v) })}
            options={WEEKDAYS.map((d) => ({ value: String(d.id), label: d.label }))}
          />
        )}

        {rec.freq === "monthly" && (
          <div className="inline-flex items-center gap-1 text-xs text-muted">
            day
            <input
              inputMode="numeric"
              value={String(rec.dayOfMonth ?? 1)}
              onChange={(e) => {
                const n = Math.min(31, Math.max(1, Number(e.target.value.replace(/[^0-9]/g, "")) || 1));
                setRec({ dayOfMonth: n });
              }}
              className="w-12 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-emerald"
            />
          </div>
        )}
      </div>

      {/* dates */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <label className="inline-flex items-center gap-1.5">
          {rec.freq === "once" ? "on" : "from"}
          <DateInput value={rec.startDate} onChange={(v) => setRec({ startDate: v })} />
        </label>
        {rec.freq !== "once" && (
          <label className="inline-flex items-center gap-1.5">
            until
            <DateInput
              value={rec.endDate ?? ""}
              onChange={(v) => setRec({ endDate: v || undefined })}
            />
          </label>
        )}
      </div>

      {/* account */}
      {accounts.length > 0 && (
        <div className="mt-2">
          <Select
            value={flow.accountId ?? ""}
            onChange={(v) => set({ accountId: v || undefined })}
            options={[
              { value: "", label: "Main account (auto)" },
              ...accounts.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </div>
      )}
    </div>
  );
}
