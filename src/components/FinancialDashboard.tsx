"use client";

import { type FinancialInputs, type Projection } from "@/lib/finance";
import ProjectionChart from "./ProjectionChart";

const START_YEAR = new Date().getFullYear();

const gbp0 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function moneyShort(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 2)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return gbp0.format(n);
}

export default function FinancialDashboard({
  inputs,
  proj,
  onChange,
}: {
  inputs: FinancialInputs;
  proj: Projection;
  onChange: (key: keyof FinancialInputs, value: number) => void;
}) {
  const set = (key: keyof FinancialInputs) => (v: number) => onChange(key, v);

  const reached = proj.freedomYear !== null;

  return (
    <>
      {/* hero */}
      <section className="freedom-glow mb-10 rounded-2xl border border-border bg-surface px-6 py-10 text-center sm:px-10">
        {reached ? (
          <>
            <p className="text-sm uppercase tracking-[0.2em] text-muted">
              Financial freedom
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">
              You&rsquo;re free in{" "}
              <span className="text-emerald">{proj.freedomYear}</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-muted">
              {proj.freedomAge !== null && (
                <>at age <span className="text-foreground">{proj.freedomAge}</span> — </>
              )}
              {Math.round(proj.progress * 100)}% of the way to your{" "}
              <span className="text-gold">{moneyShort(proj.magicNumber)}</span> magic
              number.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm uppercase tracking-[0.2em] text-muted">
              Financial freedom
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
              Not within reach <span className="text-muted">yet</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-muted">
              At these settings the portfolio doesn&rsquo;t reach{" "}
              <span className="text-gold">{moneyShort(proj.magicNumber)}</span> within 60
              years. Try saving more, spending less, or adjusting the assumptions below.
            </p>
          </>
        )}
      </section>

      {/* metrics */}
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Magic number" value={moneyShort(proj.magicNumber)} accent="text-gold" />
        <Metric
          label="Years to go"
          value={proj.monthsToFreedom === null ? "—" : `${Math.ceil(proj.monthsToFreedom / 12)}`}
        />
        <Metric label="Progress" value={`${Math.round(proj.progress * 100)}%`} accent="text-emerald" />
        <Metric
          label="Coast number"
          value={proj.coastNumber === null ? "—" : moneyShort(proj.coastNumber)}
        />
      </section>

      {/* chart */}
      <section className="mb-8 rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <ProjectionChart
          series={proj.series}
          magicNumber={proj.magicNumber}
          monthsToFreedom={proj.monthsToFreedom}
          startYear={START_YEAR}
        />
      </section>

      {/* controls */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <ControlGroup title="Reality" hint="Where you stand today">
          <Dial
            label="Invested today"
            display={moneyShort(inputs.currentInvested)}
            value={inputs.currentInvested}
            min={0}
            max={2_000_000}
            step={5_000}
            onChange={set("currentInvested")}
          />
          <Dial
            label="Saved per month"
            display={gbp0.format(inputs.monthlyContribution)}
            value={inputs.monthlyContribution}
            min={0}
            max={8_000}
            step={50}
            onChange={set("monthlyContribution")}
          />
          <Dial
            label="Current age"
            display={`${inputs.currentAge}`}
            value={inputs.currentAge ?? 40}
            min={18}
            max={70}
            step={1}
            onChange={set("currentAge")}
          />
        </ControlGroup>

        <ControlGroup title="Goal" hint="The life you're funding">
          <Dial
            label="Annual spend"
            display={gbp0.format(inputs.annualSpend)}
            value={inputs.annualSpend}
            min={15_000}
            max={150_000}
            step={1_000}
            onChange={set("annualSpend")}
          />
          <Dial
            label="Other annual income"
            display={gbp0.format(inputs.ongoingAnnualIncome ?? 0)}
            value={inputs.ongoingAnnualIncome ?? 0}
            min={0}
            max={60_000}
            step={1_000}
            onChange={set("ongoingAnnualIncome")}
          />
          <Dial
            label="Withdrawal rate"
            display={`${inputs.withdrawalRatePct.toFixed(2)}%`}
            value={inputs.withdrawalRatePct}
            min={3}
            max={6}
            step={0.25}
            onChange={set("withdrawalRatePct")}
          />
        </ControlGroup>

        <ControlGroup title="Assumptions" hint="What you expect of the market">
          <Dial
            label="Real return"
            display={`${inputs.realReturnPct.toFixed(1)}%`}
            value={inputs.realReturnPct}
            min={2}
            max={9}
            step={0.5}
            onChange={set("realReturnPct")}
          />
          <p className="text-xs leading-relaxed text-muted">
            Real return is after inflation. The magic number is your spend (less other
            income) divided by the withdrawal rate.
          </p>
        </ControlGroup>
      </section>
    </>
  );
}

function Metric({
  label,
  value,
  accent = "text-foreground",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`font-display text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

function ControlGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide">{title}</h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  );
}

function Dial({
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm text-muted">{label}</span>
        <span className="text-sm font-medium text-foreground">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald"
      />
    </label>
  );
}
