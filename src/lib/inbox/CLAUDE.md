# Inbox & ingestion — `src/lib/inbox/`

The Inbox Component: the durable **queue at the head of the bookkeeper pipeline** (Capture →
Extract → Propose → Reconcile). Unlike the other components (one jsonb document per instance),
this is a **real table, one row per dropped artifact** (`inbox_item`), each with an
independent `status` lifecycle (`pending` → `extracting` → `proposed` → `applied`, or
`failed`/`dismissed`) processed asynchronously. An `InboxItem` holds the artifact `raw`
(CSV/text inline now; a blob reference for PDFs/images later — so it's typed as an opaque
string from day one), a `source`, and `extracted` candidate facts (null until processed).
Pure helpers (`isActive`, `needsReview`, `sortByNewest`, `countByStatus`) + the
`newInboxItemSchema` zod boundary (source allowlist of `csv`/`text` + a ~1MB size cap).

**Capture and Extract are wired**: drop a statement CSV (upload or paste) or a free-text note
→ `pending`; then **Extract** (`src/lib/server/extract.ts`, `processInboxItem`) parses the CSV
via `parseStatementCsv`, assigns ids + `import` provenance, **dedupes** against the spending
ledger, and moves the item to `proposed` with the fresh drafts on `extracted`. It's
synchronous behind a manual "Process" button for now — the same function will be the body of a
Vercel Cron `/api/inbox/process` runner. **Reconcile** (`src/lib/server/reconcile.ts`,
`reconcileInboxItem`) is the only point that touches the live ledger, and only on approval: it
validates the user-approved subset really came from this item (categories may be edited, rows
dropped — nothing foreign smuggled in), dedupes again, appends to spending, and flips the item
to `applied`. **The full pipeline now runs end-to-end** (drop → process → review → applied →
in spending); free-text/PDF Extract awaits the LLM stage. The server orchestration
(`extract.ts` / `reconcile.ts`) lives in `src/lib/server/CLAUDE.md`.

## Ingestion philosophy (manual now, automated later)

- Start with manual entry + CSV/statement upload. Keep ingestion behind a clean interface so
  Open Banking / Plaid automation can slot in later without touching the engine. (No live
  financial-system integrations yet.)
- **Market prices** follow the same pattern: the investments component reads quotes through the
  `PriceProvider` seam (`src/lib/investments`). The default `manualPriceProvider` returns
  nothing, so holdings value at their stored price; a live feed (broker/market-data API)
  implements the same interface later with no change to the component or UI value math.

See `src/lib/CLAUDE.md` for shared conventions; `docs/architecture/components/inbox.md` for the
generated structural view.
