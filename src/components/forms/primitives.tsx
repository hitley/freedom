/**
 * Shared form primitives used by the per-domain **editor modals** (buckets,
 * investments, spending, …). These were copy-pasted per editor; they live here
 * now so every form reads and behaves the same. Pure presentational — no domain
 * logic. The editors keep their own domain-specific sub-forms (toggles,
 * cashflow/history rows); only these generic field controls are shared.
 */

/** A labelled block: a small caption above an arbitrary control. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

/** A £-prefixed numeric input. Filters to digits and a decimal point. */
export function MoneyInput({
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

/** A bare numeric input (no prefix). Filters to digits and a decimal point. */
export function NumberInput({
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

/** A %-suffixed numeric input. Filters to digits and a decimal point. */
export function PercentInput({
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

/** A compact native `<select>` styled to match the form chrome. */
export function Select({
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

/** A compact native date picker styled to match the form chrome. */
export function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-emerald [color-scheme:dark]"
    />
  );
}
