"use client";

import { MOTIVATIONS, fireStyleMeta, type FreedomVision } from "@/lib/vision";

const gbp0 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

/**
 * The captured vision, shown above the dashboard. Read-first: it keeps the *why*
 * in view while you tune the numbers, and re-opens the capture flow to edit.
 * When a target age was set, it reflects the projection back as on-track / early
 * / late so the story and the maths stay connected.
 */
export default function VisionPanel({
  vision,
  freedomAge,
  onEdit,
}: {
  vision: FreedomVision;
  /** Projected age at freedom from the engine, or null if not reached. */
  freedomAge: number | null;
  onEdit: () => void;
}) {
  const status = targetStatus(vision.targetAge, freedomAge);

  return (
    <section className="freedom-glow mb-8 rounded-2xl border border-border bg-surface px-6 py-7 sm:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Your vision</p>
          <h1 className="mt-2 font-display text-2xl font-bold leading-snug sm:text-3xl">
            {vision.headline}
          </h1>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-muted/50 hover:text-foreground"
        >
          Edit
        </button>
      </div>

      {vision.why && <p className="mt-3 max-w-2xl text-muted">{vision.why}</p>}

      {vision.motivations.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {vision.motivations.map((id) => {
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

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-border pt-5 text-sm">
        <span className="text-muted">
          <span className="text-foreground">{fireStyleMeta(vision.fireStyle).label}</span> freedom
        </span>
        <span className="text-muted">
          <span className="text-gold">{gbp0.format(vision.annualSpend)}</span> / year
        </span>
        {vision.targetAge && (
          <span className="text-muted">
            target age <span className="text-foreground">{vision.targetAge}</span>
          </span>
        )}
        {status && (
          <span className={`ml-auto font-medium ${status.tone}`}>{status.label}</span>
        )}
      </div>
    </section>
  );
}

function targetStatus(
  targetAge: number | undefined,
  freedomAge: number | null,
): { label: string; tone: string } | null {
  if (targetAge === undefined) return null;
  if (freedomAge === null)
    return { label: "Not on track yet", tone: "text-muted" };
  const delta = targetAge - freedomAge; // positive ⇒ free earlier than hoped
  if (delta >= 1) return { label: `${delta} yr ahead of target`, tone: "text-emerald" };
  if (delta <= -1) return { label: `${-delta} yr behind target`, tone: "text-gold" };
  return { label: "Right on target", tone: "text-emerald" };
}
