"use client";

import { useState } from "react";
import { toISO, WEEKDAYS } from "@/lib/buckets";
import {
  DIVIDEND_FREQS,
  HOLDING_KINDS,
  holdingHistory,
  holdingValue,
  type Contribution,
  type Drp,
  type Holding,
  type HoldingKind,
  type HoldingSnapshot,
  type Valuation,
} from "@/lib/investments";

const gbp0 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const todayISO = () => toISO(new Date());

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** A blank recurring contribution to seed the toggle. */
const freshContribution = (): Contribution => ({
  amount: 0,
  recurrence: { freq: "monthly", startDate: todayISO(), dayOfMonth: 1 },
});

/** A blank DRP to seed the toggle. */
const freshDrp = (): Drp => ({ annualYieldPct: 4, frequency: "quarterly" });

/**
 * Add or edit a single holding: its name, type, how it's valued (market
 * units × price, or a directly-entered balance), expected growth, an optional
 * recurring contribution, and an optional dividend-reinvestment plan. Renders as
 * a modal overlay; `onSave` returns the assembled `Holding` to the parent.
 */
export default function HoldingEditor({
  holding,
  existing,
  onSave,
  onDelete,
  onCancel,
}: {
  holding: Holding;
  /** True when editing an existing holding (enables Delete). */
  existing: boolean;
  onSave: (holding: Holding) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(holding.name);
  const [kind, setKind] = useState<HoldingKind>(holding.kind);
  const [valuation, setValuation] = useState<Valuation>(holding.valuation);
  const [ticker, setTicker] = useState(holding.ticker ?? "");
  const [units, setUnits] = useState(holding.units ? String(holding.units) : "");
  const [price, setPrice] = useState(
    holding.pricePerUnit ? String(holding.pricePerUnit) : "",
  );
  const [balance, setBalance] = useState(
    holding.balance ? String(holding.balance) : "",
  );
  const [growth, setGrowth] = useState(
    holding.expectedReturnPct !== undefined ? String(holding.expectedReturnPct) : "",
  );
  const [contribution, setContribution] = useState<Contribution | null>(
    holding.contribution ?? null,
  );
  const [drp, setDrp] = useState<Drp | null>(holding.drp ?? null);
  const [history, setHistory] = useState<HoldingSnapshot[]>(holding.history ?? []);

  const canSave =
    name.trim().length > 0 &&
    (valuation === "market" ? num(units) > 0 && num(price) >= 0 : num(balance) >= 0);

  // Live preview of the resulting value.
  const previewValue = holdingValue(
    {
      ...holding,
      valuation,
      units: num(units),
      pricePerUnit: num(price),
      balance: num(balance),
    },
    undefined,
  );

  // Switching kind defaults the valuation to that kind's natural one.
  const pickKind = (id: HoldingKind) => {
    setKind(id);
    const meta = HOLDING_KINDS.find((k) => k.id === id);
    if (meta) setValuation(meta.valuation);
  };

  const save = () => {
    if (!canSave) return;
    const base = {
      id: holding.id,
      name: name.trim(),
      kind,
      valuation,
      expectedReturnPct: num(growth) > 0 ? num(growth) : undefined,
      contribution: contribution && contribution.amount > 0 ? contribution : undefined,
      drp: drp && drp.annualYieldPct > 0 ? drp : undefined,
      history: history.length > 0 ? cleanHistory(history) : undefined,
    };
    onSave(
      valuation === "market"
        ? {
            ...base,
            ticker: ticker.trim().toUpperCase() || undefined,
            units: num(units),
            pricePerUnit: num(price),
          }
        : { ...base, balance: num(balance) },
    );
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
          {existing ? "Edit holding" : "New holding"}
        </h2>

        {/* kind */}
        <div className="mt-5 flex flex-wrap gap-1.5">
          {HOLDING_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => pickKind(k.id)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                kind === k.id
                  ? "border-emerald bg-emerald/10"
                  : "border-border bg-surface hover:border-muted/50"
              }`}
            >
              <span>{k.glyph}</span>
              {k.label}
            </button>
          ))}
        </div>

        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder={valuation === "market" ? "Vanguard VAS" : "AustralianSuper"}
          className="mt-4 w-full rounded-xl border border-border bg-surface px-4 py-3 font-display text-lg outline-none transition-colors placeholder:text-muted/50 focus:border-emerald"
        />

        {/* valuation toggle */}
        <div className="mt-4">
          <Field label="How it's valued">
            <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm">
              {(
                [
                  { id: "market", label: "Market price (units × price)" },
                  { id: "balance", label: "Balance" },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setValuation(v.id)}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    valuation === v.id
                      ? "bg-surface-2 text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* valuation inputs */}
        {valuation === "market" ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Field label="Ticker">
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                maxLength={12}
                placeholder="VAS"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm uppercase outline-none transition-colors placeholder:text-muted/40 focus:border-emerald"
              />
            </Field>
            <Field label="Units">
              <NumberInput value={units} onChange={setUnits} placeholder="100" />
            </Field>
            <Field label="Price (manual)">
              <MoneyInput value={price} onChange={setPrice} placeholder="95.00" />
            </Field>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Current balance">
              <MoneyInput value={balance} onChange={setBalance} placeholder="120000" />
            </Field>
            <Field label="Expected growth %/yr">
              <PercentInput value={growth} onChange={setGrowth} placeholder="6" />
            </Field>
          </div>
        )}

        {valuation === "market" && (
          <div className="mt-3">
            <Field label="Expected growth %/yr (price appreciation)">
              <PercentInput value={growth} onChange={setGrowth} placeholder="5" />
            </Field>
          </div>
        )}

        <div className="mt-3 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm">
          <span className="text-muted">Current value</span>
          <span className="ml-2 font-display font-semibold">
            {gbp0.format(previewValue)}
          </span>
          {valuation === "market" && (
            <span className="ml-2 text-xs text-muted">
              manual price · a live feed can override this later
            </span>
          )}
        </div>

        {/* recurring contribution */}
        <Toggle
          label="Recurring contribution"
          hint="regular money in (e.g. monthly super or an ETF buy)"
          on={contribution !== null}
          onToggle={(on) => setContribution(on ? freshContribution() : null)}
        >
          {contribution && (
            <ContributionRow
              contribution={contribution}
              onChange={setContribution}
            />
          )}
        </Toggle>

        {/* DRP */}
        <Toggle
          label="Dividend reinvestment (DRP)"
          hint="dividends buy more units instead of paying cash"
          on={drp !== null}
          onToggle={(on) => setDrp(on ? freshDrp() : null)}
        >
          {drp && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-24">
                <PercentInput
                  value={String(drp.annualYieldPct)}
                  onChange={(v) => setDrp({ ...drp, annualYieldPct: Number(v) || 0 })}
                  placeholder="4"
                />
              </div>
              <span className="text-xs text-muted">yield, paid</span>
              <Select
                value={drp.frequency}
                onChange={(v) => setDrp({ ...drp, frequency: v as Drp["frequency"] })}
                options={DIVIDEND_FREQS.map((f) => ({ value: f.id, label: f.label }))}
              />
            </div>
          )}
        </Toggle>

        {/* tracking history */}
        <Toggle
          label="Tracking history"
          hint="past values you've recorded (e.g. yearly statements) — growth is worked out for you"
          on={history.length > 0}
          onToggle={(on) =>
            setHistory(on ? [{ date: todayISO(), value: 0 }] : [])
          }
        >
          {history.length > 0 && (
            <HistoryRows history={history} onChange={setHistory} />
          )}
        </Toggle>

        {/* actions */}
        <div className="mt-7 flex items-center justify-between">
          {existing ? (
            <button
              type="button"
              onClick={() => onDelete(holding.id)}
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

/** Drop blank rows and sort oldest-first before saving. */
const cleanHistory = (history: HoldingSnapshot[]): HoldingSnapshot[] =>
  history
    .filter((s) => s.date && s.value >= 0)
    .map((s) => ({
      date: s.date,
      value: s.value,
      contributed: s.contributed && s.contributed > 0 ? s.contributed : undefined,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/**
 * The history sub-form: a row per recorded snapshot (date, value, money paid in).
 * The derived growth for each period is shown read-only so you can sanity-check the
 * numbers as you type. Rows are sorted on save, so order of entry doesn't matter.
 */
function HistoryRows({
  history,
  onChange,
}: {
  history: HoldingSnapshot[];
  onChange: (next: HoldingSnapshot[]) => void;
}) {
  const setRow = (i: number, patch: Partial<HoldingSnapshot>) =>
    onChange(history.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const removeRow = (i: number) => onChange(history.filter((_, j) => j !== i));
  const addRow = () =>
    onChange([...history, { date: todayISO(), value: 0 }]);

  // Derived growth per period, keyed by the snapshot's identity (date + value).
  const periods = holdingHistory({
    id: "preview",
    name: "",
    kind: "other",
    valuation: "balance",
    history,
  });
  const periodFor = (s: HoldingSnapshot) =>
    periods.find((p) => p.date === s.date && p.value === s.value);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
        <span>Date</span>
        <span>Value</span>
        <span>Paid in</span>
        <span className="w-6" />
      </div>
      {history.map((s, i) => {
        const p = periodFor(s);
        return (
          <div key={i} className="space-y-1">
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
              <input
                type="date"
                value={s.date}
                onChange={(e) => setRow(i, { date: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm outline-none focus:border-emerald"
              />
              <MoneyInput
                value={s.value ? String(s.value) : ""}
                onChange={(v) => setRow(i, { value: Number(v) || 0 })}
                placeholder="80000"
              />
              <MoneyInput
                value={s.contributed ? String(s.contributed) : ""}
                onChange={(v) => setRow(i, { contributed: Number(v) || 0 })}
                placeholder="12000"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label="Remove row"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:text-gold"
              >
                ✕
              </button>
            </div>
            {p && p.growth !== null && (
              <div className="pl-1 text-[11px] text-muted">
                growth this period:{" "}
                <span className={p.growth >= 0 ? "text-emerald" : "text-gold"}>
                  {p.growth >= 0 ? "+" : ""}
                  {gbp0.format(p.growth)}
                  {p.growthPct !== null && ` (${p.growthPct >= 0 ? "+" : ""}${p.growthPct.toFixed(1)}%)`}
                </span>
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={addRow}
        className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-muted/50 hover:text-foreground"
      >
        + Add record
      </button>
    </div>
  );
}

/** The contribution amount + recurrence sub-form. */
function ContributionRow({
  contribution,
  onChange,
}: {
  contribution: Contribution;
  onChange: (next: Contribution) => void;
}) {
  const rec = contribution.recurrence;
  const setRec = (patch: Partial<typeof rec>) =>
    onChange({ ...contribution, recurrence: { ...rec, ...patch } });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-28">
          <MoneyInput
            value={contribution.amount ? String(contribution.amount) : ""}
            onChange={(v) => onChange({ ...contribution, amount: Number(v) || 0 })}
            placeholder="500"
          />
        </div>
        <Select
          value={rec.freq}
          onChange={(v) => setRec({ freq: v as typeof rec.freq })}
          options={[
            { value: "weekly", label: "Weekly" },
            { value: "monthly", label: "Monthly" },
            { value: "once", label: "Once" },
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
                const n = Math.min(
                  31,
                  Math.max(1, Number(e.target.value.replace(/[^0-9]/g, "")) || 1),
                );
                setRec({ dayOfMonth: n });
              }}
              className="w-12 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-emerald"
            />
          </div>
        )}
      </div>
      {(rec.freq === "weekly" || rec.freq === "monthly") && (
        <div className="inline-flex items-center gap-1.5 text-xs text-muted">
          every
          <input
            inputMode="numeric"
            value={String(rec.interval ?? 1)}
            onChange={(e) => {
              const n = Math.max(1, Number(e.target.value.replace(/[^0-9]/g, "")) || 1);
              setRec({ interval: n });
            }}
            className="w-12 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-emerald"
          />
          {rec.freq === "weekly" ? "week(s)" : "month(s)"}
        </div>
      )}
    </div>
  );
}

/** A labelled on/off section that reveals its children when enabled. */
function Toggle({
  label,
  hint,
  on,
  onToggle,
  children,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-5 rounded-xl border border-border bg-surface-2 p-3">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 accent-emerald"
        />
        <span>
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
      </label>
      {on && <div className="mt-3">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

function MoneyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center rounded-xl border border-border bg-surface px-3 transition-colors focus-within:border-emerald">
      <span className="text-sm text-muted">£</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder}
        className="w-full bg-transparent px-1.5 py-2.5 text-sm outline-none placeholder:text-muted/40"
      />
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
      placeholder={placeholder}
      className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted/40 focus:border-emerald"
    />
  );
}

function PercentInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center rounded-xl border border-border bg-surface px-3 transition-colors focus-within:border-emerald">
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder}
        className="w-full bg-transparent px-1.5 py-2.5 text-sm outline-none placeholder:text-muted/40"
      />
      <span className="text-sm text-muted">%</span>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-emerald"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
