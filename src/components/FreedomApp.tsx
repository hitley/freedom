"use client";

import { useMemo, useState } from "react";
import { project, type FinancialInputs } from "@/lib/finance";
import { fireStyleMeta, type FreedomVision } from "@/lib/vision";
import type { BucketsState } from "@/lib/buckets";
import VisionOnboarding from "./onboarding/VisionOnboarding";
import VisionPanel from "./VisionPanel";
import FinancialDashboard from "./FinancialDashboard";
import BucketsPanel from "./buckets/BucketsPanel";

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

type FinancialView = "trajectory" | "buckets";

/**
 * Orchestrates the financial dimension: capture the vision first, then track the
 * numbers. State is client-side for now (no persistence yet) — the vision and the
 * engine inputs live here and flow down to the flow, the panel, and the dashboard.
 */
export default function FreedomApp() {
  const [vision, setVision] = useState<FreedomVision | null>(null);
  const [editing, setEditing] = useState(false);
  const [inputs, setInputs] = useState<FinancialInputs>(DEFAULT_INPUTS);
  const [view, setView] = useState<FinancialView>("trajectory");
  const [buckets, setBuckets] = useState<BucketsState>(SEED_BUCKETS);

  const proj = useMemo(() => project(inputs), [inputs]);

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
          ) : (
            <BucketsPanel state={buckets} onChange={setBuckets} />
          )}
        </>
      )}
    </div>
  );
}
