"use client";

import { useState } from "react";
import {
  ACCOUNT_KINDS,
  parseISO,
  toISO,
  type Account,
  type AccountFlow,
  type AccountKind,
  type FundingPlan,
  type FundingStrategy,
  type Recurrence,
} from "@/lib/buckets";
import { HOME_SYMBOL } from "@/lib/money";
import { DatePicker, MoneyInput, Select } from "@/components/forms/primitives";

/** Friendly cadence presets → the recurrence engine's `{ freq, interval }`. */
const CADENCES = [
  { id: "weekly", label: "Weekly", freq: "weekly", interval: 1 },
  { id: "fortnightly", label: "Fortnightly", freq: "weekly", interval: 2 },
  { id: "monthly", label: "Monthly", freq: "monthly", interval: 1 },
  { id: "quarterly", label: "Quarterly", freq: "monthly", interval: 3 },
  { id: "yearly", label: "Yearly", freq: "monthly", interval: 12 },
] as const;

const todayISO = () => toISO(new Date());

const cadenceIdOf = (rec: Recurrence) =>
  CADENCES.find((c) => c.freq === rec.freq && c.interval === (rec.interval ?? 1))?.id ?? "monthly";

/** Build a `Recurrence` for a preset, deriving weekday/day-of-month from the start date. */
function recurrenceFrom(cadenceId: string, startDate: string): Recurrence {
  const p = CADENCES.find((c) => c.id === cadenceId) ?? CADENCES[2];
  const d = parseISO(startDate);
  return {
    freq: p.freq,
    interval: p.interval,
    startDate,
    ...(p.freq === "weekly" ? { weekday: d.getDay() } : { dayOfMonth: d.getDate() }),
  };
}

const STRATEGIES: { id: FundingStrategy; label: string; hint: string }[] = [
  { id: "target-date", label: "Target dates", hint: "each dated bucket gets what it needs to hit its date" },
  { id: "priority", label: "Priority", hint: "fill buckets top-to-bottom, overflow to the next" },
  { id: "even", label: "Even split", hint: "share equally across buckets not yet full" },
];

const freshFlow = (): AccountFlow => ({
  id: crypto.randomUUID(),
  label: "",
  kind: "in",
  amount: 0,
  recurrence: recurrenceFrom("monthly", todayISO()),
});

const freshPlan = (): FundingPlan => ({
  strategy: "target-date",
  cadence: recurrenceFrom("monthly", todayISO()),
});

/**
 * Manage the real accounts money sits in: name, kind, balance, plus each account's
 * recurring **flows** (salary in, bills out) and an optional **funding plan** that
 * automatically fills its buckets each period. Renders as a modal overlay; `onSave`
 * returns the full account list.
 */
export default function AccountsEditor({
  accounts,
  onSave,
  onCancel,
}: {
  accounts: Account[];
  onSave: (accounts: Account[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Account[]>(accounts);
  const [expanded, setExpanded] = useState<string | null>(null);

  const update = (id: string, patch: Partial<Account>) =>
    setDraft((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const add = () => {
    const id = crypto.randomUUID();
    setDraft((prev) => [...prev, { id, name: "", kind: "savings", balance: 0 }]);
    setExpanded(id);
  };

  const remove = (id: string) => setDraft((prev) => prev.filter((a) => a.id !== id));

  const save = () =>
    onSave(
      draft
        .filter((a) => a.name.trim().length > 0)
        .map((a) => ({
          ...a,
          name: a.name.trim(),
          // Drop empty flows; keep provenance-free (manual) flows only.
          flows: (a.flows ?? []).filter((f) => f.amount > 0).map((f) => ({
            ...f,
            label: f.label.trim() || (f.kind === "in" ? "Money in" : "Money out"),
          })),
        })),
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface p-6 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-bold">Accounts</h2>
        <p className="mt-1 text-sm text-muted">
          The real places your money sits. Add what flows in and out, and let an account fill its
          buckets automatically.
        </p>

        <div className="mt-5 space-y-3">
          {draft.map((a) => {
            const isOpen = expanded === a.id;
            const flowCount = (a.flows ?? []).filter((f) => f.amount > 0).length;
            return (
              <div key={a.id} className="rounded-xl border border-border bg-surface-2 p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={a.name}
                    onChange={(e) => update(a.id, { name: e.target.value })}
                    maxLength={80}
                    placeholder="Account name"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted/50 focus:border-emerald"
                  />
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    aria-label="Remove account"
                    className="shrink-0 rounded-lg px-2 py-2 text-sm text-muted transition-colors hover:text-gold"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={a.kind}
                    onChange={(e) => update(a.id, { kind: e.target.value as AccountKind })}
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-emerald"
                  >
                    {ACCOUNT_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-1 items-center rounded-lg border border-border bg-surface px-3 transition-colors focus-within:border-emerald">
                    <span className="text-sm text-muted">{HOME_SYMBOL}</span>
                    <input
                      inputMode="numeric"
                      value={a.balance ? String(a.balance) : ""}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                        update(a.id, { balance: Number.isFinite(n) ? n : 0 });
                      }}
                      placeholder="Balance"
                      className="w-full bg-transparent px-1.5 py-2 text-sm outline-none placeholder:text-muted/40"
                    />
                  </div>
                </div>

                {/* expand: flows + funding */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                  className="mt-2 flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
                >
                  <span>
                    Money in &amp; out{flowCount > 0 ? ` · ${flowCount}` : ""}
                    {a.funding ? " · auto-fills buckets" : ""}
                  </span>
                  <span className={`transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                </button>

                {isOpen && (
                  <div className="mt-2 space-y-4 border-t border-border pt-3">
                    <FlowsSection
                      flows={a.flows ?? []}
                      onChange={(flows) => update(a.id, { flows })}
                    />
                    <FundingSection
                      plan={a.funding ?? null}
                      onChange={(funding) => update(a.id, { funding: funding ?? undefined })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={add}
          className="mt-3 w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted transition-colors hover:border-muted/50 hover:text-foreground"
        >
          + Add account
        </button>

        <div className="mt-7 flex items-center justify-end gap-2">
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
            className="rounded-full bg-emerald px-6 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** A compact cadence + start-date control shared by flows and the funding plan. */
function CadenceControl({
  rec,
  onChange,
}: {
  rec: Recurrence;
  onChange: (rec: Recurrence) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={cadenceIdOf(rec)}
        onChange={(id) => onChange(recurrenceFrom(id, rec.startDate))}
        options={CADENCES.map((c) => ({ value: c.id, label: c.label }))}
      />
      <label className="inline-flex items-center gap-1.5 text-xs text-muted">
        from
        <DatePicker
          value={rec.startDate}
          onChange={(startDate) => onChange(recurrenceFrom(cadenceIdOf(rec), startDate))}
        />
      </label>
    </div>
  );
}

/** The "money in & out" list for one account. */
function FlowsSection({
  flows,
  onChange,
}: {
  flows: AccountFlow[];
  onChange: (flows: AccountFlow[]) => void;
}) {
  const setFlow = (next: AccountFlow) =>
    onChange(flows.map((f) => (f.id === next.id ? next : f)));
  const removeFlow = (id: string) => onChange(flows.filter((f) => f.id !== id));

  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        Money in &amp; out
      </div>
      <div className="space-y-2">
        {flows.map((f) => (
          <div key={f.id} className="rounded-lg border border-border bg-surface p-2.5">
            <div className="flex items-center gap-2">
              <input
                value={f.label}
                onChange={(e) => setFlow({ ...f, label: e.target.value })}
                maxLength={80}
                placeholder={f.kind === "in" ? "e.g. Salary" : "e.g. Mortgage"}
                className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none placeholder:text-muted/50 focus:border-emerald"
              />
              <button
                type="button"
                onClick={() => removeFlow(f.id)}
                aria-label="Remove flow"
                className="shrink-0 rounded-md px-1.5 py-1.5 text-sm text-muted transition-colors hover:text-gold"
              >
                ✕
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
                {(["in", "out"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFlow({ ...f, kind: k })}
                    className={`rounded-md px-2.5 py-1 transition-colors ${
                      f.kind === k
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
              <div className="w-28">
                <MoneyInput
                  value={f.amount ? String(f.amount) : ""}
                  onChange={(v) => setFlow({ ...f, amount: Number(v) || 0 })}
                  placeholder="0"
                />
              </div>
              <CadenceControl rec={f.recurrence} onChange={(recurrence) => setFlow({ ...f, recurrence })} />
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...flows, freshFlow()])}
        className="mt-2 w-full rounded-lg border border-dashed border-border py-2 text-xs text-muted transition-colors hover:border-muted/50 hover:text-foreground"
      >
        + Add flow
      </button>
    </div>
  );
}

/** The optional auto-funding plan for one account. */
function FundingSection({
  plan,
  onChange,
}: {
  plan: FundingPlan | null;
  onChange: (plan: FundingPlan | null) => void;
}) {
  const set = (patch: Partial<FundingPlan>) => plan && onChange({ ...plan, ...patch });
  const fixed = plan?.amount != null;

  return (
    <div>
      <label className="flex cursor-pointer items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Auto-fill this account&apos;s buckets
        </span>
        <input
          type="checkbox"
          checked={plan != null}
          onChange={(e) => onChange(e.target.checked ? freshPlan() : null)}
          className="accent-emerald"
        />
      </label>

      {plan && (
        <div className="mt-3 space-y-3">
          {/* strategy */}
          <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-0.5 text-xs">
            {STRATEGIES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => set({ strategy: s.id })}
                title={s.hint}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  plan.strategy === s.id ? "bg-emerald/15 text-emerald" : "text-muted hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{STRATEGIES.find((s) => s.id === plan.strategy)?.hint}</p>

          {/* how much */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs">
              <button
                type="button"
                onClick={() => set({ amount: undefined })}
                className={`rounded-md px-2.5 py-1 transition-colors ${!fixed ? "bg-emerald/15 text-emerald" : "text-muted"}`}
              >
                Whatever&apos;s spare
              </button>
              <button
                type="button"
                onClick={() => set({ amount: plan.amount ?? 0 })}
                className={`rounded-md px-2.5 py-1 transition-colors ${fixed ? "bg-emerald/15 text-emerald" : "text-muted"}`}
              >
                Fixed amount
              </button>
            </div>
            {fixed && (
              <div className="w-28">
                <MoneyInput
                  value={plan.amount ? String(plan.amount) : ""}
                  onChange={(v) => set({ amount: Number(v) || 0 })}
                  placeholder="0"
                />
              </div>
            )}
          </div>

          {/* cadence */}
          <CadenceControl rec={plan.cadence} onChange={(cadence) => set({ cadence })} />
        </div>
      )}
    </div>
  );
}
