/**
 * Component types for the **ingestion inbox** — the durable queue at the head of the
 * bookkeeper pipeline (Capture → Extract → Propose → Reconcile, see
 * `design-notes/001-ingestion-inbox-bookkeeper.md`).
 *
 * Unlike the other Components (each a single jsonb document per instance), the
 * inbox is a **real table with one row per dropped artifact**: items have independent
 * lifecycles, are queried by status, and are processed asynchronously. An item is
 * captured raw and untouched, then a later stage extracts candidate facts from it,
 * which become reviewable drafts, which (on approval) reconcile into a Component — today,
 * spending. The raw artifact is never mutated; status and derived fields move around it.
 *
 * Everything here is plain data — the helpers in `index.ts` stay pure and the DAL
 * (`src/lib/server/inbox.ts`) owns all I/O and authorization.
 */

/**
 * What kind of artifact was dropped. `csv` and `text` are handled today (the
 * deterministic, AI-free capture stage); `pdf` / `image` / `email` are reserved for
 * the LLM-extractor stage and not produced yet.
 */
export type InboxSource = "csv" | "text" | "pdf" | "image" | "email";

/**
 * Where an item is in the pipeline:
 *  - `pending`    — captured, awaiting processing.
 *  - `extracting` — a processor has claimed it and is pulling out candidate facts.
 *  - `proposed`   — extraction produced drafts awaiting the user's review.
 *  - `applied`    — drafts were approved and reconciled into a Component.
 *  - `failed`     — extraction errored (see `error`); can be retried.
 *  - `dismissed`  — the user discarded it; kept for provenance, never applied.
 */
export type InboxStatus =
  | "pending"
  | "extracting"
  | "proposed"
  | "applied"
  | "failed"
  | "dismissed";

/** Statuses an item rests in (no processor is actively working it). */
export const TERMINAL_STATUSES: InboxStatus[] = ["applied", "dismissed"];

/**
 * One dropped artifact and its place in the pipeline. `raw` holds the artifact
 * inline (CSV/text today); large binaries (PDF/image) will move to blob storage with
 * just a reference here, which is why it's typed as an opaque string from day one.
 */
export interface InboxItem {
  id: string;
  instanceId: string;
  source: InboxSource;
  /** A short human label for the drop (e.g. a filename or "Pasted text"). */
  label: string;
  /** The captured artifact — inline text now; a blob reference later. */
  raw: string;
  status: InboxStatus;
  /** Candidate facts pulled out by the Extract stage; null until processed. */
  extracted: unknown | null;
  /** Failure detail when `status` is `failed`; null otherwise. */
  error: string | null;
  createdAt: Date;
  /** When processing last moved the item out of `pending`; null until then. */
  processedAt: Date | null;
}

/** The fields a client supplies to capture a new item — everything else is derived. */
export interface NewInboxItem {
  source: InboxSource;
  label: string;
  raw: string;
}

/** Human labels + glyphs for sources, for chips and the capture picker. */
export const INBOX_SOURCES: {
  id: InboxSource;
  label: string;
  glyph: string;
  ready: boolean;
}[] = [
  { id: "csv", label: "Statement CSV", glyph: "📄", ready: true },
  { id: "text", label: "Pasted text", glyph: "📝", ready: true },
  { id: "pdf", label: "PDF bill", glyph: "🧾", ready: false },
  { id: "image", label: "Photo", glyph: "📷", ready: false },
  { id: "email", label: "Email", glyph: "✉️", ready: false },
];

/** Human labels for statuses, for the inbox list chips. */
export const INBOX_STATUSES: { id: InboxStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "extracting", label: "Processing" },
  { id: "proposed", label: "Ready to review" },
  { id: "applied", label: "Applied" },
  { id: "failed", label: "Failed" },
  { id: "dismissed", label: "Dismissed" },
];
