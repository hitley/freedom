# 💸 Spending

_The user's observed outgoings and income — the data behind annualised spend._

::: tip Generated from source
This page is generated from the code: file descriptions come from each file's header comment, the model from `types.ts`, and the behaviours from the `@source` tags on the feature specs. Improve the code's comments to enrich it.
:::

## Components

### Domain (pure)

| File | Responsibility |
| --- | --- |
| `csv.ts` | Deterministic CSV → candidate transactions — the AI-free **Extract** stage of the ingestion pipeline (see `design-notes/001-ingestion-inbox-bookkeeper.md`). Pure and I/O-free: given the raw text of a bank/current-account statement export, it produces {@link DraftTransaction}s the inbox can dedupe and propose for review. |
| `index.ts` | _—_ |
| `types.ts` | Domain types for **spending** — the user's *observed* outgoings and income, as opposed to the *intended* movements modelled by buckets' `Cashflow`s. |

### Access layer (server)

| File | Responsibility |
| --- | --- |
| `spending.ts` | _—_ |

### UI

| File | Responsibility |
| --- | --- |
| `SpendingPanel.tsx` | _—_ |
| `TransactionEditor.tsx` | _—_ |

## Model

The data types this context owns (from `types.ts`).

| Type | Kind | Description |
| --- | --- | --- |
| `Direction` | type | Which way money moved: `in` (a credit) or `out` (a debit/spend). |
| `SpendingCategory` | type | What a transaction was for. Drives grouping and what counts as *spend*: - `transfer` is money moving between the user's own accounts — never spend, never income (it would otherwise double-count). - `income` labels `in` transactions (salary, interest); it isn't a spend bucket. - everything else, on an `out` transaction, is spend. |
| `TransactionSource` | type | Where a transaction came from — its provenance. An imported row keeps the id of the inbox item it was extracted from, so a bad import can be traced back and undone wholesale. Hand-entered rows are simply `manual`. |
| `Transaction` | interface | One observed movement of money — a single statement line or a manual entry. |
| `DraftTransaction` | type | A transaction before it's been given an identity and provenance — what the CSV parser produces. The Extract stage assigns an `id` and an `import` `source` to turn each draft into a full {@link Transaction}. |
| `SpendingState` | interface | The full client-side state: every transaction the user tracks. |
| `MonthSpend` | interface | Spend within one calendar month, for the by-month breakdown. |
| `CategorySpend` | interface | Spend within one category, for the by-category breakdown. |
| `SpendWindow` | interface | The observed-spend reading over the data's own window. `annualised` scales the window up to a full year, so a few months of statements still answer "what would a year cost" — caveat the obvious: short or sparse windows extrapolate noisily. |
| `SpendingSummary` | interface | Whole-state rollup for the summary header. |

## Behaviours

Executable specifications that validate this context:

- [Extract bank statements into reviewable proposals](/features/ingestion/extract)
- [Reconcile approved proposals into the spending ledger](/features/ingestion/reconcile)
- [Reading a year of spend from observed transactions](/features/spending/annualised-spend)
