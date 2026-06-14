"use client";

import { useState } from "react";
import {
  EMPTY_VISION,
  FIRE_STYLES,
  MOTIVATIONS,
  fireStyleMeta,
  type FreedomVision,
} from "@/lib/vision";

const gbp0 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const STEPS = ["Picture it", "Why it matters", "The goal", "Review"] as const;

export default function VisionOnboarding({
  initial,
  onComplete,
  onCancel,
}: {
  /** Pre-fill when editing an existing vision; omitted for a fresh start. */
  initial?: FreedomVision;
  onComplete: (vision: FreedomVision) => void;
  /** Provided only when editing — lets the user back out without losing data. */
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<FreedomVision>(initial ?? EMPTY_VISION);

  const set = <K extends keyof FreedomVision>(key: K, value: FreedomVision[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const toggleMotivation = (id: string) =>
    setDraft((prev) => ({
      ...prev,
      motivations: prev.motivations.includes(id)
        ? prev.motivations.filter((m) => m !== id)
        : [...prev.motivations, id],
    }));

  /** Pick a FIRE style and adopt its suggested spend (unless already customised). */
  const chooseStyle = (id: FreedomVision["fireStyle"]) =>
    setDraft((prev) => {
      const wasDefault = prev.annualSpend === fireStyleMeta(prev.fireStyle).defaultSpend;
      return {
        ...prev,
        fireStyle: id,
        annualSpend: wasDefault ? fireStyleMeta(id).defaultSpend : prev.annualSpend,
      };
    });

  const canAdvance =
    step === 0 ? draft.headline.trim().length > 0 : true;
  const isLast = step === STEPS.length - 1;

  const next = () => {
    if (!canAdvance) return;
    if (isLast) onComplete({ ...draft, headline: draft.headline.trim(), why: draft.why.trim() });
    else setStep((s) => s + 1);
  };
  const back = () => (step === 0 ? onCancel?.() : setStep((s) => s - 1));

  return (
    <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col px-5 py-10 sm:px-8">
      {/* progress */}
      <div className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-emerald" : "bg-border"
              }`}
            />
          ))}
        </div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
      </div>

      {/* body */}
      <div className="flex-1">
        {step === 0 && (
          <Stage
            title="Picture your freedom"
            lede="Forget the numbers for a moment. In one line, what does being free actually look like for you?"
          >
            <input
              autoFocus
              value={draft.headline}
              onChange={(e) => set("headline", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
              maxLength={120}
              placeholder="Sail the Med with my family every summer"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 font-display text-lg text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-emerald"
            />
          </Stage>
        )}

        {step === 1 && (
          <Stage
            title="Why does it matter?"
            lede="The goal sticks when the reason is clear. Pick what's driving you, then say more if you like."
          >
            <div className="mb-6 flex flex-wrap gap-2">
              {MOTIVATIONS.map((m) => {
                const on = draft.motivations.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMotivation(m.id)}
                    className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                      on
                        ? "border-emerald bg-emerald/10 text-foreground"
                        : "border-border bg-surface text-muted hover:border-muted/50"
                    }`}
                  >
                    <span className="mr-1.5">{m.glyph}</span>
                    {m.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={draft.why}
              onChange={(e) => set("why", e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="When I'm free, I'll have the time and headspace to…"
              className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-emerald"
            />
          </Stage>
        )}

        {step === 2 && (
          <Stage
            title="Name the goal"
            lede="What flavour of freedom are you funding, and what would it cost to live it each year?"
          >
            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              {FIRE_STYLES.map((s) => {
                const on = draft.fireStyle === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => chooseStyle(s.id)}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                      on
                        ? "border-emerald bg-emerald/5"
                        : "border-border bg-surface hover:border-muted/50"
                    }`}
                  >
                    <div className="font-display text-sm font-semibold">{s.label}</div>
                    <div className="mt-0.5 text-xs text-muted">{s.blurb}</div>
                  </button>
                );
              })}
            </div>

            <label className="block">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm text-muted">Target annual spend</span>
                <span className="font-display text-lg font-semibold text-gold">
                  {gbp0.format(draft.annualSpend)}
                </span>
              </div>
              <input
                type="range"
                min={15_000}
                max={150_000}
                step={1_000}
                value={draft.annualSpend}
                onChange={(e) => set("annualSpend", Number(e.target.value))}
                className="w-full accent-emerald"
              />
            </label>

            <label className="mt-6 block">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm text-muted">
                  Free by age <span className="text-muted/60">(optional aspiration)</span>
                </span>
                <span className="text-sm font-medium text-foreground">
                  {draft.targetAge ?? "—"}
                </span>
              </div>
              <input
                type="range"
                min={30}
                max={70}
                step={1}
                value={draft.targetAge ?? 55}
                onChange={(e) => set("targetAge", Number(e.target.value))}
                className="w-full accent-gold"
              />
            </label>
          </Stage>
        )}

        {step === 3 && (
          <Stage
            title="Here's your vision"
            lede="This is what you're working toward. You can refine it any time."
          >
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display text-2xl font-bold leading-snug">
                {draft.headline || "Untitled vision"}
              </h3>
              {draft.why && (
                <p className="mt-3 text-muted">{draft.why}</p>
              )}
              {draft.motivations.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {draft.motivations.map((id) => {
                    const m = MOTIVATIONS.find((x) => x.id === id);
                    return (
                      <span
                        key={id}
                        className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted"
                      >
                        {m?.glyph} {m?.label}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-5">
                <Fact label="Style" value={fireStyleMeta(draft.fireStyle).label} />
                <Fact label="Annual spend" value={gbp0.format(draft.annualSpend)} accent="text-gold" />
                <Fact label="Free by" value={draft.targetAge ? `age ${draft.targetAge}` : "—"} />
              </div>
            </div>
          </Stage>
        )}
      </div>

      {/* nav */}
      <div className="mt-10 flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          className="rounded-full px-4 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:invisible"
          disabled={step === 0 && !onCancel}
        >
          {step === 0 ? "Cancel" : "Back"}
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!canAdvance}
          className="rounded-full bg-emerald px-6 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLast ? "Start tracking" : "Continue"}
        </button>
      </div>
    </div>
  );
}

function Stage({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-lg text-muted">{lede}</p>
      <div className="mt-8">{children}</div>
    </div>
  );
}

function Fact({
  label,
  value,
  accent = "text-foreground",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`font-display text-base font-semibold ${accent}`}>{value}</div>
    </div>
  );
}
