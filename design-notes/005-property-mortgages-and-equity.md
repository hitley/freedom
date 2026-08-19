# 005 — Property: mortgages, equity & property scenarios

- **Date:** 2026-08-19
- **Status:** exploring
- **Summary:** A new **Property** Component modelling a portfolio of properties (each an
  appreciating asset paired with an amortizing mortgage), producing per-property payoff
  ETAs, overpayment what-ifs, and equity/rental that feed the freedom Trajectory.

## Problem

The user has a home with a mortgage and substantial equity, and wants to (a) project when the
mortgage is paid off and (b) see how the equity plays into their freedom picture. It later grew
to: **multiple properties**, a **primary vs investment** distinction, and **hypothetical "future"
properties** to play with.

## Fork 1 — which Component owns this? → **a new one (`Property`)**

A home + mortgage introduces a concept the app doesn't model: a **liability that amortizes down**,
paired with an **asset that appreciates up**. Neither existing Component fits:

- **[Investments](../src/lib/investments/CLAUDE.md)** models *freedom-generating assets that
  compound upward* (super, shares, ETFs). No notion of a liability; its engine only grows a value
  — it can't split a payment into interest/principal or unwind a loan balance.
- **[Buckets](../src/lib/buckets/CLAUDE.md)** can *schedule* a payment as a cashflow, but it
  replays cashflows against account balances — no interest/principal split, no shrinking principal.

Per the repo rule — *"New concepts get their own Component rather than bolting onto an existing
one"* ([`src/lib/CLAUDE.md`](../src/lib/CLAUDE.md)) — this becomes **Property**, mapping onto the
app's project → capture → trajectory-&-ETA spine, with mortgage payoff as a "freedom-from-debt" ETA
alongside the freedom date.

## Fork 2 — scope → **Property-only, but a list of properties**

Not a generic Liabilities Component (rejected as premature abstraction). The unit is a **list of
properties**, each pairing a value with its mortgage, classified on two axes.

### Axis 1 — Role: `primary` vs `investment`

Role changes the math and how equity/income flows into the [Trajectory](../src/lib/finance/CLAUDE.md):

| | **Primary residence** | **Investment property** |
|---|---|---|
| Equity counts toward | **Total net worth** — but *not* the freedom "magic number" (you live in it) | Depends on the equity model (Fork 3) |
| Income | — | **Rental income** → passive income toward freedom spend |
| Extra fields | — | rent, gross/net yield, (later) costs, vacancy |

Key subtlety: the Trajectory must ingest property equity as **two separate lines** — *total net
worth* vs *liquid freedom assets* — so a primary residence doesn't inflate the freedom date.

### Axis 2 — Status: `owned` vs `future`

A `future` property is a hypothetical toggled on to *play with* — deposit (drawn from savings), a
new mortgage, appreciation, and (if investment) rental. It is a **scenario overlay**, not committed
data, reusing the portfolio view's *as-is comparison overlay* pattern (commit `06bd521`): freedom
trajectory **with** the purchase vs **without**.

## Fork 3 — investment-property equity in the magic number → **both, user-toggleable per property**

- **Sell-to-fund** — equity counts as a **liquid freedom asset** (you'd sell to fund freedom).
- **Hold-for-income** — only the **rental income** counts toward freedom spend; equity sits in
  total net worth, not spendable unless sold.

Modelling both and letting the user switch per property reflects how landlords actually think
(keeper vs future sale). The toggle is a per-`Property` field; the Trajectory reads it to decide
which bucket a property's equity lands in. Primary residences are excluded from the magic number
regardless — the toggle is meaningful only for the `investment` role.

## Engine sketch — `src/lib/property/`

Standard [four-file shape](../src/lib/CLAUDE.md) (`types.ts`, `index.ts`, `*Panel`, `*Editor`),
pure and I/O-free, with `index.test.ts`. Reuses the shared recurrence engine (`occurrences`,
`addMonths`, `startOfDay`, `toISO`) from [`@/lib/buckets`](../src/lib/buckets/CLAUDE.md) for payment
*timing*. New math this Component owns:

- **Amortization** (per property): each period `interest = balance × rate`,
  `principal = payment − interest`, `balance -= principal` → **payoff date/ETA** per property + a
  combined "debt-free" date.
- **Overpayment levers**: `extraMonthly` and/or a dated `lumpSum` → payoff pulled forward + total
  interest saved. Mirrors the portfolio's `extraMonthly` lever
  ([`projectPortfolio`](../src/lib/investments/CLAUDE.md)).
- **Equity**: `equity = value − balance`, optional appreciation on `value`, aggregated by role and
  equity model.
- **Scenario merge**: fold `future` properties in/out and re-derive payoff timelines + freedom-date
  impact.

### Rough data shape (illustrative, not final)

```ts
type PropertyRole = "primary" | "investment";
type PropertyStatus = "owned" | "future";
type EquityModel = "sell-to-fund" | "hold-for-income"; // investment role only

interface Property {
  id: string;
  name: string;
  role: PropertyRole;
  status: PropertyStatus;
  value: number;               // current (or purchase, for future) market value
  appreciationPct?: number;    // optional annual growth on value
  mortgage?: Mortgage;         // absent = owned outright
  rental?: Rental;             // investment role only
  equityModel?: EquityModel;   // investment role only; default hold-for-income
  currency?: string;           // ISO-4217; home-currency FX per the investments pattern
}

interface Mortgage {
  balance: number;             // outstanding principal
  annualRatePct: number;
  payment: number;             // scheduled repayment
  schedule: Schedule;          // reuse the buckets recurrence engine
  extraMonthly?: number;       // overpayment lever
  lumpSum?: { amount: number; date: string };
}

interface Rental { grossMonthly: number; /* later: costs, vacancyPct, netYield */ }
```

Follows the Investments **foreign-currency** convention: amounts stay in native `currency` at rest
and convert to home currency for display/aggregation only
([`convertToHome`](../src/lib/investments/CLAUDE.md)).

## Where each output surfaces

| Output | Surface |
|---|---|
| Payoff ETA + overpayment what-ifs | The Property View's own detail — balance-down / equity-up curves + sliders |
| Equity → net worth | [Trajectory](../src/lib/finance/CLAUDE.md), split into *total net worth* vs *liquid freedom assets* |
| Rental income | Trajectory, as passive income toward freedom spend |
| Future properties | Scenario toggle overlaid on the freedom trajectory (as-is overlay pattern) |

## Deliberately deferred / open

- **Offset accounts.** Buckets already references "spare cash in a mortgage offset" — should a
  linked offset (a Bucket/Account) net against the mortgage balance in the payoff math? *Deferred.*
- **Sale mechanics for `sell-to-fund`** (selling costs, CGT). First cut treats equity as fully
  liquid; flag the simplification in the UI. *Deferred.*
- **Rate changes over the term** (fixed → variable). First cut: single rate; a rate schedule is a
  later refinement. *Deferred.*
- **Persistence.** Likely a new `property_state` jsonb document per instance, mirroring the other
  Component documents in [`docs/architecture/data-model.md`](../docs/architecture/data-model.md).
</content>
</invoke>
