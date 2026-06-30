# 001 — Async ingestion inbox & bookkeeper pipeline

- **Date:** 2026-06-21
- **Status:** building — **all four pipeline stages run end-to-end** (Capture → Extract →
  Propose → Reconcile) as of 2026-06-22, behind a manual "Process" trigger. Remaining:
  the Vercel Cron runner (automate processing) + the LLM Extract for non-CSV sources.
- **Summary:** A drop-in inbox/queue for financial artifacts (CSV statements, bills,
  notes) processed asynchronously into the state model via a four-stage pipeline, with
  human approval before anything touches live numbers.

## The idea (as raised)

Be able to drop information — current-account statements, bills like electricity/gas —
into an inbox/queue that gets processed asynchronously. Almost a "bookkeeper agent"
that listens for new pieces of information and folds them into the current state model
so they're calculated and understood alongside everything else being tracked.

## Core decision: it's a pipeline, not (yet) an agent

Model it as four explicit stages. The "bookkeeper agent" is just one swappable stage
(Extract), not the architecture itself.

```
Capture  →  Extract  →  Propose  →  Reconcile
(inbox)     (parse)     (draft)     (apply to state)
```

- **Capture** — raw artifact lands in an inbox, stored immutably, untouched.
- **Extract** — raw blob → candidate structured facts. Deterministic for clean CSV;
  an LLM/agent for messy inputs (bills, photos, free text). This is the swappable seam.
- **Propose** — extracted facts become *drafts* that don't affect any visible number;
  categorised + deduped + matched.
- **Reconcile** — drafts confirmed (here: by the user) then folded into live state.

**Why:** keeps the slow/fallible/LLM-driven async part strictly separated from the
truth (buckets/investments/spend numbers). The agent can be wrong, retried, or swapped
without corrupting state. Same instinct as the existing `PriceProvider` seam and the
"ingestion behind a clean interface" note in `CLAUDE.md`.

## Forks chosen

| Fork | Decision | Why |
|------|----------|-----|
| **Async infra** | Vercel Cron + `/api/inbox/process` endpoint draining a batch | No new infra; fits the stack. Latency = cron interval. Inbox table designed so a queue service (Inngest/QStash) can slot in later as a runner swap, not a rewrite. |
| **Apply model** | Propose → user approves; nothing touches live state until confirmed | Financial data + existing "never trust, always confirm" posture. Agent mistakes are free. Provenance link enables undo. |
| **First input** | Bank/current-account CSV | Deterministic parser — proves the whole spine with zero AI in the critical path. LLM extractor is a later drop-in. |

## New data model

**`inbox` component — a real table** (not jsonb-on-instance: items have independent
lifecycles and are queried by status). DAL in `src/lib/server/inbox.ts`, auth-gated via
`requireInstance`, `instanceId` on every row.

```
InboxItem {
  id, instanceId,
  source: 'csv' | 'pdf' | 'image' | 'text' | 'email',
  raw: <text OR blob-ref>,          // designed for both from day one
  status: 'pending' | 'extracting' | 'proposed' | 'applied' | 'failed' | 'dismissed',
  extracted: <jsonb candidate facts>,
  error?, createdAt, processedAt
}
```

**`spending` component — new pure component** (four-file pattern like `buckets`/
`investments`). This is genuinely new: buckets hold *scheduled* `Cashflow`s
(intentions); investments hold holdings; there's nowhere for *observed* expenses to
land today.

- `types.ts`: `Transaction { id, date, amount, description, category, source: inboxItemId | 'manual' }`
- `index.ts`: `summarise` (total, by-category, by-month) + **`annualisedSpend`** — the
  figure that feeds the vision's target spend → magic number → freedom date. **This is
  the loop the feature closes:** target spend is hand-typed today; the bookkeeper makes
  it observed.
- zod boundary + `*Panel` + review UI.

## Key design details

- **Provenance is non-negotiable.** Every applied entry links back to its `InboxItem`
  (which statement, which row). That's the audit trail (a planned hardening item, got
  for free here) and what makes a bad import one-click undoable.
- **Dedupe at the Propose stage.** Stable hash of `date + amount + normalised
  description` per `instanceId`, so re-importing an overlapping statement doesn't
  double-count.
- **zod the extracted facts before they become drafts** — LLM/parser output is
  untrusted input crossing a trust boundary, same rule as user input.

## Explicitly deferred

- **Transaction ↔ Cashflow matching.** A scheduled `Cashflow` is the *intention*; an
  imported `Transaction` is the *observation*. Matching ("did the bill arrive as
  expected?") is a later feature. Keep the two as **separate concepts** now so it's a
  feature, not a migration — do not try to unify them.
- **LLM bookkeeper (Extract stage) for bills / photos / free text** — v2, behind the
  same `InboxItem → candidate facts` interface. Same review queue, approve flow,
  provenance.
- **CSV format handling.** UK exports vary (Monzo/Starling/Barclays/Amex). Lean: a
  tiny column-mapping step confirmed on first import per bank, rather than sniffing.
- **Blob storage.** CSV text inline in Postgres is fine; PDFs/images (v2) want Vercel
  Blob with a ref in the row — hence `raw` is "text OR blob-ref" from day one.

## Build order (spine first, AI-free)

1. ✅ `inbox` table + DAL (2026-06-22) — `inbox_item` table (many rows/instance,
   `(instance_id, status)` index, migration `0003`), pure `src/lib/inbox` component (types +
   helpers + `newInboxItemSchema` + 6 tests), DAL `src/lib/server/inbox.ts`
   (`listInbox`/`addInboxItem`/`getInboxItem`/`setInboxStatus`, all owner-scoped).
2. ✅ `spending` pure component — `src/lib/spending` (types + helpers + zod + 16 tests).
   `Transaction` (signed by `direction`, `source` carries import provenance),
   `summarise` / `spendByCategory` / `spendByMonth`, `spendWindow` / `annualisedSpend`,
   and `dedupeKey` / `dedupe` for the Propose stage. Landed 2026-06-22.
2b. ✅ **Spending made a full feature ahead of the inbox** (2026-06-22) — chosen so the
   ledger is persisted and visible before ingestion writes into it. Added `spending_state`
   jsonb table (migration `0002`, applied to Neon), DAL `src/lib/server/spending.ts`
   (`load`/`save`, owner-scoped, zod in+out), `saveSpendingAction`, page load + `FreedomApp`
   wiring (debounced save, illustrative seed), and the UI: `spending/SpendingPanel`
   (annualised-spend headline **vs the vision target** — step 6 in spirit — by-category
   breakdown, transaction list) + `spending/TransactionEditor` modal for manual entry.
3. ✅ Capture UI (2026-06-22) — `inbox/InboxPanel` as a fifth **Inbox** tab: source
   toggle (CSV/text), CSV upload **or** paste, free-text note → `addInboxItemAction`
   creates a `pending` item (synchronous, returns it), with the queue list + dismiss.
   Verified end-to-end in the browser (capture persists across reload; dismiss soft-sets).
4. ✅ Extract stage (2026-06-22) — deterministic `parseStatementCsv` (`src/lib/spending/
   csv.ts`: RFC-ish CSV reader, fuzzy header→column detection, UK date/amount parsing →
   `DraftTransaction`s; 14 tests) + `src/lib/server/extract.ts` `processInboxItem`
   (parse → assign id+`import` source → `dedupe` vs ledger → `proposed` with drafts on
   `extracted`). Driven by a manual **Process** button for now; the Vercel Cron
   `/api/inbox/process` runner will wrap the *same* function later. Verified in-browser
   on a Paid Out/Paid In statement: correctly skipped a summary row and deduped 2 rows
   against the seed.
5. ✅ Reconcile / review screen (2026-06-22) — `src/lib/server/reconcile.ts`
   `reconcileInboxItem` (validates the approved subset belongs to the item — categories
   editable, rows droppable, nothing foreign — re-dedupes, appends to spending, marks
   `applied`) + `inbox/ReviewModal` (per-row category select + Drop/Restore, "Add N to
   spending"). Action returns the applied item *and* the new spending state so the ledger
   updates live. Verified in-browser: approved 2 drafts (re-categorised), item → `applied`,
   the Sainsbury's row landed in Spending tagged "imported" and survived reload.

   **Remaining (not blocking the manual loop):**
   - Vercel Cron `/api/inbox/process` runner wrapping `processInboxItem` (auto-processing).
   - LLM Extract stage for bills / photos / free text.
   - The earlier deferrals: transaction↔cashflow matching, per-bank CSV mapping, blob storage.
6. Wire `annualisedSpend` into the vision as an "actual spend" reading beside the typed
   target. *(Partly done: the Spending panel already shows annualised vs target; feeding
   it back into the engine's `annualSpend`/trajectory is the remaining piece.)*

Then v2: LLM extractor as a drop-in upgrade to stage 2 (Extract).
