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
| `RecurringLink` | interface | A confirmed reconciliation link: this observed transaction is the actual that satisfied a specific expected occurrence of a {@link RecurringExpense}. The link lives on the transaction (not a separate store) so it's auditable and undoable, the same instinct as import provenance. Only stamped on user confirmation. |
| `Transaction` | interface | One observed movement of money — a single statement line or a manual entry. |
| `DraftTransaction` | type | A transaction before it's been given an identity and provenance — what the CSV parser produces. The Extract stage assigns an `id` and an `import` `source` to turn each draft into a full {@link Transaction}. |
| `RecurringExpense` | interface | A **recurring/expected expense** — the *intended* side of spending, the counterpart to the observed {@link Transaction} ledger. A commitment with a cadence and an estimate: monthly direct debits, quarterly water, the annual car service. Summed and normalised to "per month", these form a stable, bottom-up budget — a steadier feed to the vision's target spend than extrapolating a short window of observed transactions. |
| `SpendingState` | interface | The full client-side state: observed transactions plus the expected-expense budget. |
| `MonthSpend` | interface | Spend within one calendar month, for the by-month breakdown. |
| `CategorySpend` | interface | Spend within one category, for the by-category breakdown. |
| `SpendWindow` | interface | The observed-spend reading over the data's own window. `annualised` scales the window up to a full year, so a few months of statements still answer "what would a year cost" — caveat the obvious: short or sparse windows extrapolate noisily. |
| `SpendingSummary` | interface | Whole-state rollup for the summary header. |
| `CategoryBudget` | interface | Monthly-equivalent budget within one category, for the budget breakdown. |
| `BudgetSummary` | interface | The bottom-up budget rollup: the headline monthly/annual figures + breakdown. |
| `DueOccurrence` | interface | One expected occurrence of a recurring expense within a window. |
| `ReconcileStatus` | type | Where an expected occurrence stands against reality: - `matched` — an actual transaction has been reconciled to it; - `overdue` — its due date has passed (≤ `asOf`) with no matched actual; - `due`     — still upcoming (> `asOf`), not yet settled. |
| `ReconciledOccurrence` | interface | An expected occurrence paired with the actual that settled it (if any). |
| `ReconcileView` | interface | The reconciliation reading over a window: each expected occurrence with its matched actual (or overdue/due), plus **unmatched actuals** — real spend in the window with no commitment behind it. |

## Behaviours

Executable specifications that validate this context:

- [Extract bank statements into reviewable proposals](/features/ingestion/extract)
- [Reconcile approved proposals into the spending ledger](/features/ingestion/reconcile)
- [Reading a year of spend from observed transactions](/features/spending/annualised-spend)
- [A bottom-up budget from recurring expenses](/features/spending/recurring-budget)
