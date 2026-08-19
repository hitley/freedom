# 006 — Dynamic accounts & bucket funding

- **Date:** 2026-08-19
- **Status:** exploring — forks agreed (below), build deferred. This note is the proposal to
  react to.
- **Summary:** Give **accounts recurring flows** (wages in, mortgage P&I out, investment
  contributions out) so balances move over time instead of being static, and replace the fiddly
  per-bucket recurring cashflows with an account-level **funding plan** that distributes money
  into that account's buckets by a chosen strategy (target-date / priority / even). Cross-component
  flows (investments now, mortgage via [005](005-property-mortgages-and-equity.md) later) are
  **derived, not retyped**, to avoid double-entry.

## Problem

Two rough edges in [buckets](../src/lib/buckets/CLAUDE.md):

1. **Accounts are static.** `Account.balance` is a single number, but real accounts churn —
   salary lands, the mortgage P&I leaves, investment contributions leave, bills leave. Only
   *bucket-linked* cashflows currently move an account balance in `simulate`; there's no way to
   say "wages of $X/fortnight into Current" independent of a bucket.
2. **Per-bucket recurring cashflows are fiddly.** To fund five buckets you add five recurring
   `in` cashflows, each with its own amount/cadence/account. What the user actually wants: *"I've
   got these buckets fed from this account — just fill them toward their target dates."*

(The bucket-detail **axis-pinning** ask shipped separately — `axisMax` on `ProjectionChart`, so
what-if drags no longer rescale the frame. Not part of this design.)

## Point 2 — accounts gain flows

Add recurring **`AccountFlow`s** to an account: `{ id, label, kind: "in" | "out", amount,
recurrence }`, reusing the recurrence engine. `simulate` applies them to the account balance on a
monthly grid alongside the existing bucket cashflows.

**Cross-component flows are derived, not duplicated.** An investment contribution and a mortgage
P&I payment *already* live in another Component; retyping them as account flows would be
double-entry that silently drifts. Instead:

- Add an optional **`fromAccountId`** to a holding's `Contribution` (Investments). When set, the
  buckets/accounts projection folds that contribution in as an *out*flow on that account — one
  source of truth, two views.
- Mortgage **P&I** derives the same way once [Property (005)](005-property-mortgages-and-equity.md)
  lands: the amortization schedule's payment is an *out*flow on its linked account.
- Only genuinely-unmodelled movements are hand-entered `AccountFlow`s: **salary in**, generic
  **bills/direct-debits out**.

**Keeping the engine pure.** The buckets engine can't import Investments/Property. So the
**DAL/UI assembles** the full flow set — stored manual `AccountFlow`s + derived flows read from the
other Components — and passes them in: `simulate(state, from, to, { accountFlows })`. The engine
stays I/O-free and just replays whatever flows it's handed. (This is the same seam ES note
[004](004-event-sourcing-the-financial-activity-spine.md) predicts: these flows are the *ongoing
stream* — `IncomeReceived` / `ContributionMade` / `BillPaid` — that becomes events later. Shape
`AccountFlow` so it maps cleanly onto those event types.)

## Point 3 — an account funding plan

Replace the "add a recurring cashflow per bucket" chore with **one funding plan per account**:
each period, sweep money from the account into *its* buckets, distributed by a strategy. Per-bucket
cashflows stay, but only for the **exceptions** — a dated holiday `out`/`drain` spend, a one-off
top-up — not the routine filling.

### Fork A — distribution strategy → **support all three (per-account toggle)**

A `FundingPlan.strategy` on the account:

- **`target-date`** — bottom-up, the headline mode. Each bucket with a `targetDate` gets its
  **required/period = remaining ÷ periods-left** (the same bottom-up shape as spending's
  `monthlyEquivalent` / `budgetSummary`), and the plan surfaces *"you need $X/period to hit every
  date"* — mirroring the budget headline so the two Components read alike. Ongoing buckets (target,
  no date) take a set share.
- **`priority`** — waterfall. Fill the first bucket to its target, overflow to the next. **Priority
  is the existing drag-reorder order** — no new construct; the order you already arrange buckets in
  *is* the priority.
- **`even`** — split the period's amount equally across buckets not yet at target.

### Fork B — where the amount comes from → **computed surplus, with a fixed-amount override (both)**

`FundingPlan.amount?` is optional:

- **omitted → computed surplus.** The account's flows (wages in − mortgage/investments/bills out)
  leave a surplus each period; the plan sweeps that (optionally a `sharePct` of it) into buckets.
  This is what ties Point 2 to Point 3 — real cashflow drives real funding, and the mortgage P&I
  (Property) reduces the surplus that's left to save.
- **set → fixed cap/amount.** Override with a flat "$X/period into buckets," independent of the
  computed surplus (or as a ceiling on it).

### Rough data shape (illustrative, not final)

```ts
interface AccountFlow {
  id: string;
  label: string;
  kind: "in" | "out";
  amount: number;
  recurrence: Recurrence;           // reuse the buckets recurrence engine
  // derived flows carry provenance instead of being stored on the account:
  source?: "manual" | "investment" | "mortgage";
  sourceRef?: string;               // holdingId / propertyId for derived flows
}

type FundingStrategy = "target-date" | "priority" | "even";

interface FundingPlan {
  strategy: FundingStrategy;
  cadence: Recurrence;              // when the sweep happens
  amount?: number;                  // fixed cap/amount; omit = use computed surplus
  sharePct?: number;               // portion of surplus to sweep (default 100)
}

interface Account {
  // …existing id/name/kind/balance…
  flows?: AccountFlow[];            // manual only; derived flows injected at projection time
  funding?: FundingPlan;
}
```

Bucket **priority** needs no new field — it's the array order (already drag-reorderable). A bucket
may gain a light `funding?: { mode: "goal" | "ongoing" }` hint if "ongoing vs goal" can't be
inferred from `target`/`targetDate` alone.

## Engine sketch

Extend `simulate` (still pure, still I/O-free):

1. **Apply account flows** (manual + injected derived) to account balances on the monthly grid,
   chronologically, alongside existing bucket cashflows.
2. **Per period, per account with a `funding` plan:** compute the sweep amount (surplus or fixed),
   then distribute across that account's buckets by `strategy` — target-date requirements /
   priority waterfall / even split — capping each bucket at its `target`. Distribution moves money
   *from account-unallocated into bucket allocations* (buckets fill; the account's allocated share
   rises), so the existing `AccountView` unallocated/allocated math keeps working.
3. Existing `projectedTargetDate` / shortfall detection ride on top unchanged.

The **UI** gains: an account editor section for flows + the funding plan (strategy toggle, amount
or "use surplus", cadence), and a buckets headline echoing the budget — *"$X/mo to stay on track
for your dates."* Reuse the shared cadence picker, `DateInput`/`DatePicker`, and the drag-reorder
for priority.

## Forks agreed

| Fork | Decision |
|------|----------|
| Distribution strategy | **All three** — per-account `strategy` toggle (`target-date` / `priority` / `even`). |
| Funding source | **Both** — computed surplus by default, optional fixed `amount` override. |
| Cross-component flows | **Derived, not duplicated** — `fromAccountId` seam on investment contributions now; mortgage P&I via Property later. |
| Per-bucket cashflows | **Coexist** — kept for exceptions (dated spends/one-offs); the funding plan handles routine filling. |
| Engine purity | Buckets engine stays pure; the **DAL/UI assembles** manual + derived flows and injects them. |

## Deliberately deferred / open

- **Building it.** Direction agreed; no code yet. Likely first slice: `AccountFlow` + manual flows
  + the `priority`/`even` strategies (no cross-component derivation), then target-date mode, then
  the investment-contribution `fromAccountId` derivation, then mortgage once Property exists.
- **Mortgage P&I derivation** waits on the [Property Component (005)](005-property-mortgages-and-equity.md).
- **Salary/income as a first-class concept.** Today income lives loosely (vision's "other annual
  income", spending income transactions). A hand-entered `in` `AccountFlow` covers it for now; a
  proper Income concept is a later question (and an ES event type per [004](004-event-sourcing-the-financial-activity-spine.md)).
- **Surplus over/under-commitment** UX — when required (target-date) exceeds the computed surplus,
  surface the gap (like the budget's variance), don't silently under-fund.
- **Persistence.** Rides inside the existing `buckets_state` jsonb document — no migration.

## Relationship to other notes

- **[004 (ES spine)](004-event-sourcing-the-financial-activity-spine.md):** `AccountFlow`s are the
  *ongoing stream* (income/contribution/bill events) in current-state clothing. Shape them to map
  onto those event types so the later ES fold is mechanical.
- **[005 (Property)](005-property-mortgages-and-equity.md):** mortgage P&I is a derived account
  *out*flow; the post-P&I surplus is what funds buckets. Build the derivation seam here; wire the
  mortgage end when Property lands.
</content>
</invoke>
