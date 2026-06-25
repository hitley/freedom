# 📥 Inbox & ingestion

_The durable queue and pipeline at the head of the bookkeeper: capture → extract → propose → reconcile._

::: tip Generated from source
This page is generated from the code: file descriptions come from each file's header comment, the model from `types.ts`, and the behaviours from the `@source` tags on the feature specs. Improve the code's comments to enrich it.
:::

## Components

### Domain (pure)

| File | Responsibility |
| --- | --- |
| `index.ts` | _—_ |
| `types.ts` | Domain types for the **ingestion inbox** — the durable queue at the head of the bookkeeper pipeline (Capture → Extract → Propose → Reconcile, see `design-notes/001-ingestion-inbox-bookkeeper.md`). |

### Access layer (server)

| File | Responsibility |
| --- | --- |
| `inbox.ts` | _—_ |
| `extract.ts` | _—_ |
| `reconcile.ts` | _—_ |

### UI

| File | Responsibility |
| --- | --- |
| `InboxPanel.tsx` | _—_ |
| `ReviewModal.tsx` | _—_ |

## Model

The data types this context owns (from `types.ts`).

| Type | Kind | Description |
| --- | --- | --- |
| `InboxSource` | type | What kind of artifact was dropped. `csv` and `text` are handled today (the deterministic, AI-free capture stage); `pdf` / `image` / `email` are reserved for the LLM-extractor stage and not produced yet. |
| `InboxStatus` | type | Where an item is in the pipeline: - `pending`    — captured, awaiting processing. - `extracting` — a processor has claimed it and is pulling out candidate facts. - `proposed`   — extraction produced drafts awaiting the user's review. - `applied`    — drafts were approved and reconciled into a domain. - `failed`     — extraction errored (see `error`); can be retried. - `dismissed`  — the user discarded it; kept for provenance, never applied. |
| `InboxItem` | interface | One dropped artifact and its place in the pipeline. `raw` holds the artifact inline (CSV/text today); large binaries (PDF/image) will move to blob storage with just a reference here, which is why it's typed as an opaque string from day one. |
| `NewInboxItem` | interface | The fields a client supplies to capture a new item — everything else is derived. |

## Behaviours

Executable specifications that validate this context:

- [Extract bank statements into reviewable proposals](/features/ingestion/extract)
- [Reconcile approved proposals into the spending ledger](/features/ingestion/reconcile)
