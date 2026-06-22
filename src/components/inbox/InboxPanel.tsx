"use client";

import { useRef, useState } from "react";
import {
  INBOX_SOURCES,
  INBOX_STATUSES,
  isActive,
  MAX_RAW_CHARS,
  type InboxItem,
  type NewInboxItemInput,
} from "@/lib/inbox";

/** The sources the capture stage can actually accept (matches the zod boundary). */
type CapturableSource = NewInboxItemInput["source"];

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const sourceMeta = (id: string) => INBOX_SOURCES.find((s) => s.id === id);
const statusLabel = (id: string) =>
  INBOX_STATUSES.find((s) => s.id === id)?.label ?? id;

// The two sources the capture stage handles today (deterministic, no AI). Only
// `ready` sources are offered, and those are exactly the capturable ones.
const CAPTURABLE: { id: CapturableSource; label: string; glyph: string }[] =
  INBOX_SOURCES.filter((s) => s.ready).map(({ id, label, glyph }) => ({
    id: id as CapturableSource,
    label,
    glyph,
  }));

/**
 * The inbox view — the head of the bookkeeper pipeline. Drop a bank-statement CSV
 * (upload or paste) or a free-text note; it's captured as a `pending` item for
 * asynchronous processing into the spending ledger. Capture is the only stage wired
 * today — items sit `pending` until the Extract/Propose stages land. State lives in
 * the parent; capture and dismiss go through their server actions.
 */
export default function InboxPanel({
  items,
  onAdd,
  onDismiss,
}: {
  items: InboxItem[];
  onAdd: (input: NewInboxItemInput) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}) {
  const [source, setSource] = useState<CapturableSource>("csv");
  const [label, setLabel] = useState("");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const tooBig = raw.length > MAX_RAW_CHARS;
  const canAdd = label.trim().length > 0 && raw.trim().length > 0 && !tooBig && !busy;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setRaw(text);
    // Default the label to the filename if the user hasn't named it yet.
    setLabel((prev) => prev || file.name);
  };

  const submit = async () => {
    if (!canAdd) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd({ source, label: label.trim(), raw: raw.trim() });
      setLabel("");
      setRaw("");
      if (fileInput.current) fileInput.current.value = "";
    } catch {
      setError("Couldn't add that — check it isn't empty or too large.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      {/* capture */}
      <div className="mb-8 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Drop something in
        </h2>
        <p className="mt-1 text-xs text-muted">
          A bank-statement CSV or a quick note. It&apos;s queued and processed into your
          spending — no need to sort it now.
        </p>

        {/* source */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {CAPTURABLE.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSource(s.id)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                source === s.id
                  ? "border-emerald bg-emerald/10"
                  : "border-border bg-surface hover:border-muted/50"
              }`}
            >
              <span aria-hidden>{s.glyph}</span>
              {s.label}
            </button>
          ))}
        </div>

        {/* file upload (CSV only) */}
        {source === "csv" && (
          <div className="mt-4">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => readFile(e.target.files?.[0])}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-4 file:py-2 file:text-sm file:text-foreground hover:file:bg-border"
            />
          </div>
        )}

        {/* label */}
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
          placeholder={source === "csv" ? "May statement" : "Note about a bill"}
          className="mt-4 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted/50 focus:border-emerald"
        />

        {/* raw paste */}
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={source === "csv" ? 5 : 3}
          placeholder={
            source === "csv"
              ? "…or paste CSV rows here:\nDate,Description,Amount\n2026-05-01,Tesco,-42.10"
              : "e.g. Paid £92 to Octopus for May gas & electric"
          }
          className="mt-3 w-full rounded-xl border border-border bg-surface px-4 py-3 font-mono text-xs leading-relaxed outline-none transition-colors placeholder:text-muted/40 focus:border-emerald"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-muted">
            {tooBig ? (
              <span className="text-gold">Too large — keep it under ~1MB.</span>
            ) : error ? (
              <span className="text-gold">{error}</span>
            ) : raw.trim() ? (
              `${raw.trim().split("\n").length} line${raw.trim().split("\n").length === 1 ? "" : "s"}`
            ) : (
              "Upload, or paste above"
            )}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!canAdd}
            className="rounded-full bg-emerald px-6 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add to inbox"}
          </button>
        </div>
      </div>

      {/* queue */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Queue
        </h2>
        <span className="text-xs text-muted">
          Processing into spending arrives in the next stage.
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center text-muted">
          Nothing here yet. Drop a statement or a note above and it&apos;ll queue up.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {items.map((item, i) => {
            const meta = sourceMeta(item.source);
            const dismissed = item.status === "dismissed";
            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i > 0 ? "border-t border-border" : ""
                } ${dismissed ? "opacity-50" : ""}`}
              >
                <span className="text-lg" aria-hidden>
                  {meta?.glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-sm text-foreground ${dismissed ? "line-through" : ""}`}
                  >
                    {item.label}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {meta?.label} · {dateTime.format(item.createdAt)}
                  </div>
                </div>
                <StatusChip status={item.status} />
                {isActive(item) && (
                  <button
                    type="button"
                    onClick={() => onDismiss(item.id)}
                    aria-label="Dismiss"
                    className="shrink-0 rounded-full px-2 py-1 text-xs text-muted transition-colors hover:text-gold"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** A coloured chip for an item's pipeline status. */
function StatusChip({ status }: { status: InboxItem["status"] }) {
  // Tailwind exposes only the base palette; shade with opacity.
  const tone =
    status === "proposed"
      ? "border-emerald/40 bg-emerald/10 text-emerald"
      : status === "failed"
        ? "border-gold/40 bg-gold/10 text-gold"
        : status === "applied"
          ? "border-emerald/40 bg-emerald/10 text-emerald"
          : "border-border bg-surface-2 text-muted";
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}
