"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { project, type FinancialInputs } from "@/lib/finance";
import { fireStyleMeta, type FreedomVision } from "@/lib/vision";
import type { BucketsState } from "@/lib/buckets";
import type { InvestmentsState } from "@/lib/investments";
import VisionOnboarding from "./onboarding/VisionOnboarding";
import VisionPanel from "./VisionPanel";
import FinancialDashboard from "./FinancialDashboard";
import BucketsPanel from "./buckets/BucketsPanel";
import InvestmentsPanel from "./investments/InvestmentsPanel";

/**
 * Reality + assumptions a fresh user starts from. The *goal* side (annual spend)
 * is owned by the captured vision and seeded in when the flow completes — so the
 * dashboard always funds the life the user articulated.
 */
const DEFAULT_INPUTS: FinancialInputs = {
  currentInvested: 325_000,
  monthlyContribution: 1_500,
  annualSpend: 50_000,
  realReturnPct: 5,
  withdrawalRatePct: 4,
  ongoingAnnualIncome: 0,
  currentAge: 40,
};

const DIMENSIONS = [
  { id: "financial", label: "Financial", ready: true },
  { id: "time", label: "Time", ready: false },
  { id: "health", label: "Health", ready: false },
];

/**
 * Example buckets that tell the motivating story: money piled into a mortgage
 * offset, with purposes (emergency / holiday / splurge) carved back out of it
 * and a chunk left unallocated. Stable ids so SSR and client render match.
 * Like DEFAULT_INPUTS, this is illustrative starter data, not real figures.
 */
const SEED_BUCKETS: BucketsState = {
  accounts: [
    { id: "acc-offset", name: "Mortgage offset", kind: "offset", balance: 60_000 },
    { id: "acc-savings", name: "Savings", kind: "savings", balance: 8_000 },
  ],
  buckets: [
    {
      id: "b-emergency",
      name: "Emergency fund",
      glyph: "🛟",
      target: 20_000,
      allocations: [{ accountId: "acc-offset", amount: 15_000 }],
      cashflows: [
        {
          id: "cf-emergency-top-up",
          label: "Monthly top-up",
          kind: "in",
          amount: 300,
          accountId: "acc-offset",
          recurrence: { freq: "monthly", startDate: "2026-06-20", dayOfMonth: 20 },
        },
      ],
    },
    {
      id: "b-holiday",
      name: "Holiday fund",
      glyph: "🏖️",
      target: 6_000,
      targetDate: "2026-09-18",
      allocations: [
        { accountId: "acc-offset", amount: 1_000 },
        { accountId: "acc-savings", amount: 1_500 },
      ],
      cashflows: [
        {
          id: "cf-holiday-save",
          label: "Weekly saving",
          kind: "in",
          amount: 500,
          accountId: "acc-savings",
          // Every Friday until the holiday.
          recurrence: {
            freq: "weekly",
            startDate: "2026-06-19",
            endDate: "2026-09-18",
            weekday: 5,
          },
        },
        {
          id: "cf-holiday-spend",
          label: "Holiday spend",
          kind: "out",
          amount: 0,
          drain: true,
          accountId: "acc-savings",
          // Spend whatever's saved, on the day.
          recurrence: { freq: "once", startDate: "2026-09-18" },
        },
      ],
    },
    {
      id: "b-splurge",
      name: "Splurge",
      glyph: "✨",
      target: 3_000,
      allocations: [{ accountId: "acc-savings", amount: 1_200 }],
      cashflows: [
        {
          id: "cf-splurge-save",
          label: "Monthly saving",
          kind: "in",
          amount: 100,
          accountId: "acc-savings",
          recurrence: { freq: "monthly", startDate: "2026-06-28", dayOfMonth: 28 },
        },
      ],
    },
  ],
};

/**
 * Example holdings that tell the investing story: a super balance growing with
 * regular contributions, plus two market-priced ETFs/shares valued on units ×
 * (manual) price, one of them reinvesting its dividends (DRP). Stable ids so SSR
 * and client render match. Illustrative starter data, not real figures.
 */
const SEED_INVESTMENTS: InvestmentsState = {
  holdings: [
    {
      id: "h-super",
      name: "Workplace super",
      kind: "super",
      valuation: "balance",
      balance: 142_000,
      expectedReturnPct: 6,
      contribution: {
        amount: 1_100,
        recurrence: { freq: "monthly", startDate: "2026-06-15", dayOfMonth: 15 },
      },
      // Six years of recorded balances — value at each year-end and the amount
      // paid in over that year, so per-year growth can be derived. Illustrative.
      history: [
        { date: "2020-06-30", value: 78_000 },
        { date: "2021-06-30", value: 96_500, contributed: 12_000 },
        { date: "2022-06-30", value: 104_000, contributed: 12_400 },
        { date: "2023-06-30", value: 118_500, contributed: 12_800 },
        { date: "2024-06-30", value: 131_000, contributed: 13_000 },
        { date: "2025-06-30", value: 142_000, contributed: 13_200 },
      ],
    },
    {
      id: "h-vas",
      name: "Vanguard VAS",
      kind: "etf",
      valuation: "market",
      ticker: "VAS",
      units: 850,
      pricePerUnit: 96.4,
      expectedReturnPct: 5,
      drp: { annualYieldPct: 4, frequency: "quarterly" },
      contribution: {
        amount: 500,
        recurrence: { freq: "monthly", startDate: "2026-06-01", dayOfMonth: 1 },
      },
    },
    {
      id: "h-cba",
      name: "CBA shares",
      kind: "shares",
      valuation: "market",
      ticker: "CBA",
      units: 120,
      pricePerUnit: 178.2,
      expectedReturnPct: 4,
      drp: { annualYieldPct: 3.5, frequency: "semiannual" },
    },
  ],
};

type FinancialView = "trajectory" | "buckets" | "investments";

type SaveState = "idle" | "saving" | "saved";

/**
 * Debounced persistence of a piece of state. Skips the first run so simply
 * loading the page (seeding state from the server) doesn't trigger a redundant
 * write; thereafter it saves the latest value 700ms after changes settle.
 */
function useDebouncedSave<T>(
  value: T,
  save: (value: T) => Promise<unknown>,
  setSaveState: (s: SaveState) => void,
) {
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(async () => {
      try {
        await save(value);
        setSaveState("saved");
      } catch {
        setSaveState("idle");
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [value, save, setSaveState]);
}

interface FreedomAppProps {
  /** Persisted engine inputs for this instance, or null to use the defaults. */
  initialInputs: FinancialInputs | null;
  /** Persisted vision, or null if not captured yet (then onboarding runs). */
  initialVision: FreedomVision | null;
  /** Persisted buckets state, or null to use the illustrative seed. */
  initialBuckets: BucketsState | null;
  /** Persisted investments state, or null to use the illustrative seed. */
  initialInvestments: InvestmentsState | null;
  /** Server action persisting the engine inputs (auth/validation server-side). */
  saveInputsAction: (inputs: FinancialInputs) => Promise<{ ok: true }>;
  /** Server action persisting the captured vision. */
  saveVisionAction: (vision: FreedomVision) => Promise<{ ok: true }>;
  /** Server action persisting the buckets state. */
  saveBucketsAction: (buckets: BucketsState) => Promise<{ ok: true }>;
  /** Server action persisting the investments state. */
  saveInvestmentsAction: (investments: InvestmentsState) => Promise<{ ok: true }>;
  /** Server action that signs the user out. */
  signOutAction: () => Promise<void>;
  /** Display name (or email) of the signed-in user. */
  userName: string | null;
}

/**
 * Orchestrates the financial dimension: capture the vision first, then track the
 * numbers. Every domain is persisted per-instance — seeded from the server on
 * load and saved (debounced) on change. The vision is saved explicitly when the
 * capture flow completes.
 */
export default function FreedomApp({
  initialInputs,
  initialVision,
  initialBuckets,
  initialInvestments,
  saveInputsAction,
  saveVisionAction,
  saveBucketsAction,
  saveInvestmentsAction,
  signOutAction,
  userName,
}: FreedomAppProps) {
  const [vision, setVision] = useState<FreedomVision | null>(initialVision);
  const [editing, setEditing] = useState(false);
  const [inputs, setInputs] = useState<FinancialInputs>(initialInputs ?? DEFAULT_INPUTS);
  const [view, setView] = useState<FinancialView>("trajectory");
  const [buckets, setBuckets] = useState<BucketsState>(initialBuckets ?? SEED_BUCKETS);
  const [investments, setInvestments] = useState<InvestmentsState>(
    initialInvestments ?? SEED_INVESTMENTS,
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const proj = useMemo(() => project(inputs), [inputs]);

  // Debounced persistence of each editable domain (vision is saved explicitly on
  // completion). The hook skips its first run so seeding from the server doesn't
  // write back.
  useDebouncedSave(inputs, saveInputsAction, setSaveState);
  useDebouncedSave(buckets, saveBucketsAction, setSaveState);
  useDebouncedSave(investments, saveInvestmentsAction, setSaveState);

  const onChange = (key: keyof FinancialInputs, value: number) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const completeVision = (v: FreedomVision) => {
    setVision(v);
    // The goal the user named becomes the spend the engine funds.
    setInputs((prev) => ({
      ...prev,
      annualSpend: v.annualSpend,
      ongoingAnnualIncome:
        v.fireStyle === "barista"
          ? Math.max(prev.ongoingAnnualIncome ?? 0, fireStyleMeta(v.fireStyle).defaultSpend / 2)
          : prev.ongoingAnnualIncome,
    }));
    setEditing(false);
    // Persist the captured vision immediately (not debounced — it's a deliberate
    // commit, and `inputs` is saved separately by its own debounced effect).
    setSaveState("saving");
    saveVisionAction(v)
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("idle"));
  };

  const showFlow = vision === null || editing;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-display text-2xl font-bold tracking-tight">
            freedom<span className="text-emerald">.</span>
          </div>
          <p className="mt-1 text-sm text-muted">Three dimensions. One life.</p>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <nav className="flex gap-1 rounded-full border border-border bg-surface p-1">
            {DIMENSIONS.map((d) => (
              <button
                key={d.id}
                disabled={!d.ready}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  d.ready
                    ? "bg-surface-2 text-foreground"
                    : "text-muted/60 cursor-not-allowed"
                }`}
              >
                {d.label}
                {!d.ready && <span className="ml-1 text-[10px] uppercase">soon</span>}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-xs text-muted">
            {saveState !== "idle" && (
              <span>{saveState === "saving" ? "Saving…" : "Saved"}</span>
            )}
            {userName && <span className="text-muted/70">{userName}</span>}
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-full border border-border px-3 py-1 transition-colors hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {showFlow ? (
        <VisionOnboarding
          initial={vision ?? undefined}
          onComplete={completeVision}
          onCancel={vision ? () => setEditing(false) : undefined}
        />
      ) : (
        <>
          <VisionPanel
            vision={vision}
            freedomAge={proj.freedomAge}
            onEdit={() => setEditing(true)}
          />

          <div className="mb-8 inline-flex gap-1 rounded-full border border-border bg-surface p-1">
            {(
              [
                { id: "trajectory", label: "Trajectory" },
                { id: "buckets", label: "Buckets" },
                { id: "investments", label: "Investments" },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  view === v.id
                    ? "bg-surface-2 text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {view === "trajectory" ? (
            <FinancialDashboard inputs={inputs} proj={proj} onChange={onChange} />
          ) : view === "buckets" ? (
            <BucketsPanel state={buckets} onChange={setBuckets} />
          ) : (
            <InvestmentsPanel state={investments} onChange={setInvestments} />
          )}
        </>
      )}
    </div>
  );
}
