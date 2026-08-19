"use client";

import { useState } from "react";
import {
  DateInput,
  DatePicker,
  Field,
  MoneyInput,
  NumberInput,
  PercentInput,
  Select,
} from "@/components/forms/primitives";
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
import { formatMoney, HOME_CURRENCY } from "@/lib/money";

/** Currencies offerable for a holding. Home first; the rest are common expat cases. */
const CURRENCIES = [HOME_CURRENCY, "GBP", "USD", "EUR", "NZD", "JPY", "SGD", "HKD"].filter(
  (c, i, a) => a.indexOf(c) === i,
);

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
  const [currency, setCurrency] = useState(
    holding.currency?.toUpperCase() ?? HOME_CURRENCY,
  );
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
      // Home currency is the implicit default — only store a currency when it differs.
      currency: currency !== HOME_CURRENCY ? currency : undefined,
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

        {/* currency */}
        <div className="mt-4">
          <Field label="Currency">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={currency}
                onChange={setCurrency}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
              {currency !== HOME_CURRENCY && (
                <span className="text-xs text-muted">
                  entered in {currency}; shown in your portfolio as {HOME_CURRENCY} at
                  today&apos;s rate
                </span>
              )}
            </div>
          </Field>
        </div>

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
            {formatMoney(previewValue, currency, 0)}
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
            <HistoryRows history={history} onChange={setHistory} currency={currency} />
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

/** Drop blank rows (no date, or a zero/blank value) and sort oldest-first before saving. */
const cleanHistory = (history: HoldingSnapshot[]): HoldingSnapshot[] =>
  history
    .filter((s) => s.date && s.value > 0)
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
  currency,
}: {
  history: HoldingSnapshot[];
  onChange: (next: HoldingSnapshot[]) => void;
  currency: string;
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
              <DatePicker value={s.date} onChange={(v) => setRow(i, { date: v })} />
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
                  {formatMoney(p.growth, currency, 0)}
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

/**
 * Cadence presets map the friendly labels users think in ("Fortnightly") onto the
 * recurrence engine's `{ freq, interval }`. `base` decides whether the contextual
 * field is a weekday (weekly-based) or a day-of-month (monthly-based). Mirrors the
 * spending editor's picker so both Views speak the same cadence language.
 */
const CADENCE_PRESETS = [
  { id: "weekly", label: "Weekly", freq: "weekly", interval: 1, base: "weekly" },
  { id: "fortnightly", label: "Fortnightly", freq: "weekly", interval: 2, base: "weekly" },
  { id: "monthly", label: "Monthly", freq: "monthly", interval: 1, base: "monthly" },
  { id: "quarterly", label: "Quarterly", freq: "monthly", interval: 3, base: "monthly" },
  { id: "yearly", label: "Yearly", freq: "monthly", interval: 12, base: "monthly" },
  { id: "once", label: "Once", freq: "once", interval: 1, base: "once" },
] as const;

type CadenceId = (typeof CADENCE_PRESETS)[number]["id"];

/** Best-fit preset for an existing recurrence (defaults to monthly). */
function cadenceOf(freq: string, interval: number): CadenceId {
  const hit = CADENCE_PRESETS.find((p) => p.freq === freq && p.interval === interval);
  return hit?.id ?? "monthly";
}

/** How a recurring schedule ends: run forever, stop on a date, or after N buys. */
type EndsMode = "never" | "date" | "count";
const endsOf = (rec: Contribution["recurrence"]): EndsMode =>
  rec.count ? "count" : rec.endDate ? "date" : "never";

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

  const cadence = cadenceOf(rec.freq, Math.max(1, rec.interval ?? 1));
  const preset = CADENCE_PRESETS.find((p) => p.id === cadence)!;
  const recurring = preset.freq !== "once";
  const ends = endsOf(rec);

  const setCadence = (id: CadenceId) => {
    const p = CADENCE_PRESETS.find((c) => c.id === id)!;
    // Switch cadence, keeping the start date; drop fields the new base can't use.
    setRec({
      freq: p.freq,
      interval: p.interval,
      ...(p.base === "monthly"
        ? { dayOfMonth: rec.dayOfMonth ?? 1, weekday: undefined }
        : p.base === "weekly"
          ? { weekday: rec.weekday ?? 5, dayOfMonth: undefined }
          : { weekday: undefined, dayOfMonth: undefined }),
      // A one-off has no "ends" — clear any prior cap.
      ...(p.freq === "once" ? { endDate: undefined, count: undefined } : {}),
    });
  };

  const setEnds = (mode: EndsMode) => {
    if (mode === "never") setRec({ endDate: undefined, count: undefined });
    else if (mode === "date")
      setRec({ endDate: rec.endDate ?? rec.startDate, count: undefined });
    else setRec({ count: rec.count ?? 12, endDate: undefined });
  };

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
          value={cadence}
          onChange={(v) => setCadence(v as CadenceId)}
          options={CADENCE_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
        />
        {preset.base === "weekly" && (
          <Select
            value={String(rec.weekday ?? 5)}
            onChange={(v) => setRec({ weekday: Number(v) })}
            options={WEEKDAYS.map((d) => ({ value: String(d.id), label: d.label }))}
          />
        )}
        {preset.base === "monthly" && (
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

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
        <span>{recurring ? "starting" : "on"}</span>
        <DateInput
          value={rec.startDate}
          onChange={(v) => setRec({ startDate: v || rec.startDate })}
        />
      </div>

      {recurring && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
          <span>ending</span>
          <Select
            value={ends}
            onChange={(v) => setEnds(v as EndsMode)}
            options={[
              { value: "never", label: "Never" },
              { value: "date", label: "On date" },
              { value: "count", label: "After N times" },
            ]}
          />
          {ends === "date" && (
            <DateInput
              value={rec.endDate ?? rec.startDate}
              onChange={(v) => setRec({ endDate: v || undefined })}
            />
          )}
          {ends === "count" && (
            <span className="inline-flex items-center gap-1.5">
              <input
                inputMode="numeric"
                value={String(rec.count ?? 12)}
                onChange={(e) => {
                  const n = Math.max(
                    1,
                    Number(e.target.value.replace(/[^0-9]/g, "")) || 1,
                  );
                  setRec({ count: n });
                }}
                className="w-14 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-emerald"
              />
              times
            </span>
          )}
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

