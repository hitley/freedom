# 004 — Event-sourcing the financial-activity spine

- **Date:** 2026-08-16
- **Status:** exploring — direction agreed (event-source the *activity spine*, not the
  whole app), build deferred. No code yet; this note is the proposal to react to.
- **Summary:** Make the temporal financial facts (transactions, bills, contributions,
  price marks, income) an append-only **event log** that is the source of truth, with the
  current-state documents becoming **projections** folded from it. Goals/vision/assumptions
  stay current-state config. This gives a self-advancing "present", refactor-safe
  reprocessing, and — the real prize — **simulations as branched event streams**.

## The idea (as raised)

Three layers wanted over the real data:

1. **Baseline** — where I am *today*.
2. **Ongoing stream** — the day-to-day facts that just happen over time (payments, bills,
   spending, income).
3. **Simulation** — injected *fake* events that branch into a future alternate reality, to
   test scenarios and hypotheses against goals/milestones.

The motivating instinct: financial activity are *facts*. If the app later changes how it
displays or processes them, the **stream of facts doesn't change** — replay it to reach any
point, and replay can trigger new processing. Simulations then inject hypothetical events to
explore "what could this look like".

That instinct is **event sourcing**, stated correctly.

## Core decision: event-source the *spine*, not the whole app

Draw a hard line through the model:

- **Event-sourced — the activity spine.** The things that happen over time: `Transaction`,
  bills, investment `Contribution`s, price marks, income. Both the *moving present* and the
  *simulations* operate on exactly these. → an append-only `events` table is the source of
  truth; the per-Component state documents become **read models / projections** folded from
  events.
- **Current-state config — left as-is (optionally versioned).** Vision, target spend, FIRE
  style, return/withdrawal assumptions. You rarely need to "replay why my target spend is
  £42k"; modelling these as events is ceremony for no payoff. Keep them as the current
  `vision_state` / `financial_profile` shapes; add an audit trail later only if wanted.

**Why the split:** it captures ES's value where the domain is genuinely temporal, without a
big-bang rewrite of the parts that are honestly just configuration.

## Forks chosen

| Fork | Decision | Why |
|------|----------|-----|
| **ES vs CQRS** | **Event sourcing only.** No separate read/write DBs, no message bus, no async projections. Command appends event(s) **and** updates the projection in the same transaction. | Single-user app. Full CQRS is the distributed-systems tax with no payoff here. Revisit read/write split only if the read side ever strains — it won't for years. |
| **Scope** | Event-source the **activity spine**; keep goals/assumptions as current-state config. | See above — payoff concentrated in the temporal data; config gains nothing. |
| **Command vs event** | Keep it thin. Where we're recording things that already happened, "command" collapses to "append this fact". | Avoid elaborate command-handler ceremony we won't use. A command is a rejectable *intent*; an event is a *fact*. In a personal ledger most are near-trivial facts. |
| **Engine** | `src/lib/finance` stays pure functions over inputs; inputs get **folded from events** instead of read from a form. | Clean seam — the engine barely changes; only the *derivation* of its inputs does. |
| **Ingestion** | The existing inbox pipeline (001) becomes the **command source**: drop a statement → extract → emit `TransactionRecorded` events. | Reuses the pipeline that already produces transaction facts; Reconcile becomes "append events" rather than "mutate state". |

## The three layers, mapped onto ES

| Layer | ES concept | Notes |
|-------|-----------|-------|
| **1. Baseline (today)** | An **opening snapshot** — genesis events (`AccountOpened(balance, asOf)`, `HoldingOpened(...)`) — plus any real history actually captured event-by-event | You'll never have event-level history for the past. ES's standard answer: seed the log with opening-balance events dated "as of today". That *is* the baseline. Captured via *dump-from-app* (see 003-adjacent data-profiles work): play the real data in through the UI/CSV once, snapshot it. |
| **2. Ongoing stream** | Real events appended over time (`TransactionRecorded`, `BillPaid`, `PriceMarked`, `ContributionMade`, `IncomeReceived`) | Solves the "present moves every day" drift for free: "now" is `fold(events where valueDate ≤ today)`. Append tomorrow's events and the present advances itself — no re-baselining. |
| **3. Simulation** | A **branch**: copy the log to a fork point, append hypothetical events, fold into an *isolated* read model; compare branches | Store the *branch definition* (fork point + injected events), not the derived numbers. Regenerate projections on demand. This is the requirement that tips the whole design from "probably overkill" to "right call". |

## Why this is a genuine fit (not cargo-culting)

Event sourcing is the most over-adopted architecture in software; this is one of the honest
exceptions, for two *independent* reasons:

1. **The domain is inherently temporal.** Money movements, bills, contributions, price marks
   *are* dated facts. We're not forcing an event model onto CRUD data — the spending
   Component already carries a `Transaction` ledger and reconciliation links. It's ES wearing
   a trenchcoat.
2. **Simulation is a branching-timeline problem.** Alternate futures = fork the log, append
   hypotheticals, fold, compare. Trivial on an event log; miserable on mutable current-state.

## The tax (accepted, eyes open)

- **Event versioning / upcasting.** When an event's shape or meaning changes, old events need
  translating at replay ("upcasters"). Early and solo we can rewrite the whole log freely; the
  day real history matters this becomes real work. A `schemaVersion` rides on each event.
- **Corrections are append-only, and finance corrections are constant.** Never mutate a past
  event — a miscategorisation or duplicate import becomes a *compensating* event
  (`TransactionRecategorised`, `TransactionVoided`). This pulls in **bitemporality**: *value
  date* (when it happened) vs *recorded-at* (when we learned it). Finance wants both axes;
  design for it up front — retrofitting is painful.
- **Snapshots for sanity, not speed.** Replaying a few thousand events is instant, so
  performance isn't the driver — but periodic checkpoints let us fold to a checkpoint and
  replay only newer events, *and* insulate against ancient event schemas. Worth having early.
- **Sim/real isolation is a new leak surface.** Given the whole real-data-safety posture (the
  real/demo profile split, real db living outside the repo), a simulation branch that
  accidentally appends into the **real** stream is the new "demo shows real numbers" failure.
  Real and sim must be hard-separated by stream identity, and a sim must be *structurally
  incapable* of writing to the real log. Same rigor as the profile separation.

## Blast radius

This is **not** a data-loading feature — it re-architects persistence for the spine. Today the
app stores current-state documents (`buckets_state`, `investments_state`, `spending_state` as
jsonb). ES inverts that: events become truth; those documents become projections rebuilt from
events. Scoping to the spine (not vision/config) is what keeps this from swallowing the app.

## Phased path (lowest-risk first)

0. **Events table, no behaviour change.** Add an append-only `events` table (owner/instance
   scoped, `valueDate` + `recordedAt`, `type`, `schemaVersion`, `payload` jsonb) alongside
   everything. Nothing reads from it yet.
1. **Spending as a projection.** Fold `spending_state` from `TransactionRecorded` /
   `TransactionRecategorised` / `TransactionReconciled` events. Most event-like Component,
   lowest risk; the inbox already produces the facts. Proves the pattern in the safest corner.
2. **Investments activity as events.** Contributions, snapshots, price marks.
3. **Simulation engine.** Branch, inject hypothetical events, project, compare. The payoff —
   future projections toward goals/milestones as first-class alternate timelines.

Vision / goals / assumptions: stay current-state config throughout (model as low-frequency
events later only if an audit trail is wanted).

## Explicitly deferred

- **Building any of it.** Direction agreed; no code yet. Phase 0 is the first concrete step
  when picked up.
- **Full CQRS** (separate read/write stores, async projections, buses) — only if the read side
  ever strains.
- **Event-sourcing the config** (vision/assumptions) — deferred, probably indefinitely.
- **Upcasting machinery** — while the log is disposable we rewrite it freely; build upcasters
  when real history becomes load-bearing.
- **Automated bitemporal corrections UI** — model the two time axes now; the correction UX is
  later.

## Relationship to other notes

- Builds on **001 (ingestion inbox & bookkeeper)** — that pipeline becomes the command source;
  Reconcile shifts from "mutate state" to "append events".
- Interacts with the **local data profiles** work (real/demo/simulate, `ProfileBanner`,
  `~/.freedom` outside-the-repo real data): a *profile* becomes fundamentally "an event stream
  + its projections", and the **dump-from-app** flow is how a real **baseline** gets captured.
