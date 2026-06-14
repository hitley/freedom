"use client";

import { useMemo, useState } from "react";
import { project, type FinancialInputs } from "@/lib/finance";
import { fireStyleMeta, type FreedomVision } from "@/lib/vision";
import VisionOnboarding from "./onboarding/VisionOnboarding";
import VisionPanel from "./VisionPanel";
import FinancialDashboard from "./FinancialDashboard";

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
 * Orchestrates the financial dimension: capture the vision first, then track the
 * numbers. State is client-side for now (no persistence yet) — the vision and the
 * engine inputs live here and flow down to the flow, the panel, and the dashboard.
 */
export default function FreedomApp() {
  const [vision, setVision] = useState<FreedomVision | null>(null);
  const [editing, setEditing] = useState(false);
  const [inputs, setInputs] = useState<FinancialInputs>(DEFAULT_INPUTS);

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
          <FinancialDashboard inputs={inputs} proj={proj} onChange={onChange} />
        </>
      )}
    </div>
  );
}
