# Spending — `src/lib/spending/`

The Spending Component: pure data + helpers for the user's *observed* outgoings and income —
the counterpart to buckets' *intended* `Cashflow`s. Each `Transaction` is a single statement
line or manual entry: a positive `amount` plus a `direction` (`in`/`out`), a `category`, and a
`source` (`manual` or an `import` carrying the originating `inboxItemId` for provenance).
"Spend" deliberately excludes own-account `transfer`s (and income), so totals reflect real
outgoings: `isSpend` / `isIncome` gate the rollups, `summarise` gives totals +
`spendByCategory` + `spendByMonth`, and **`spendWindow` / `annualisedSpend`** scale the observed
window to a full year — the data-backed figure intended to feed the vision's target spend.
Imports dedupe at the Propose stage via `dedupeKey`
(`date|signedAmount|normalisedDescription`, id/provenance excluded so the same real
transaction from two statements keys equal) and the `dedupe(existing, candidates)` splitter.
`spendingStateSchema` is the zod boundary.

Alongside the *observed* ledger the component now models the **expected** side: a
**`RecurringExpense`** (payee, category, GBP `estimate`, `basis` `fixed`/`estimated`, a
`Recurrence` reused from buckets, `active`) is one commitment in a **bottom-up budget**.
`monthlyEquivalent` normalises each commitment to a per-month figure (analytic and
bound-agnostic — 12÷interval monthly, 52÷interval weekly, a `once` is not part of the
steady budget); `monthlyBudget` / `annualBudget` / `budgetByCategory` / `budgetSummary`
roll up the **active** lines — the **stable** counterpart to the noisy `annualisedSpend`,
the better feed to the vision target. `dueOccurrences(recurring, from, to)` expands
commitments over a window (via the recurrence engine); `reconcileWindow(state, from, to,
asOf)` pairs each expected occurrence with the **actual that settled it** — matched by a
*confirmed* `transaction.recurring` link (`{ expenseId, dueDate }`, stamped on
user-approval only), else `overdue` (past `asOf`) / `due` (upcoming) — plus the
**unmatched actuals** (spend with no commitment). `suggestMatches(expense, dueDate,
transactions)` proposes (never auto-applies) the actuals that could settle an occurrence —
unlinked spend within ±N days, inside a basis-dependent amount band (tight for `fixed`,
wide for `estimated`), same category *or* a `match.descriptions` narrative hit — ranked
best-fit-first as `MatchCandidate`s; the user confirms one to stamp the link. Bill
ingestion is the next slice — full design in
`design-notes/003-recurring-expenses-and-budget-reconciliation.md`. This is also the
**first piece of the async ingestion inbox / bookkeeper pipeline** (design
in `design-notes/001-ingestion-inbox-bookkeeper.md`).

It also owns the **deterministic CSV parser** (`csv.ts`): `parseStatementCsv(raw,
mappingOverride?)` locates columns by fuzzy header matching (single signed `amount`, or
separate debit/credit) and tolerantly parses UK date/amount formats into `DraftTransaction`s
— pure and unit-tested (`csv.test.ts`); `ColumnMapping` is returned so a per-bank mapping
step can override detection later. `proposedTransactionsSchema` is the shape the Extract
stage stores on an inbox item (deduped drafts + counts).

UI: persisted and surfaced via `spending/SpendingPanel` + its editors/modals — see
`src/components/CLAUDE.md`. See `src/lib/CLAUDE.md` for shared conventions;
`docs/architecture/components/spending.md` for the generated structural view.
