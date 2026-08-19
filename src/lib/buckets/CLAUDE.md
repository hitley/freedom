# Buckets — `src/lib/buckets/`

The Buckets Component: pure data + helpers for a virtual layer of *purpose* over real
accounts. You record each `Account`'s balance, then carve `Allocation` slices into purpose
`Bucket`s; a bucket can draw from several accounts. Today-snapshot helpers (`bucketView`,
`accountView`, `summarise`) derive each bucket's balance / % funded and — the key insight —
each account's **unallocated remainder** (money with no purpose, e.g. spare cash in a
mortgage offset). Buckets also carry **`Cashflow`s** (scheduled money in/out): `schedule.ts`
is a pure recurrence engine (`occurrences` for once / weekly-on-weekday / monthly-on-day,
with intervals + end dates, plus date utils; a schedule can be capped either by an `endDate`
**or** a `count` — "stop after N occurrences", counted from `startDate` — so a fortnightly
buy can run "26 times" rather than to a date), and `simulate(state, from, to)` replays every
cashflow chronologically into a **`Timeline`** of bucket & account balances over time. A
dated **`out` + `drain`** flow models a spend event (e.g. a holiday) that empties the bucket
on its date; `projectedTargetDate` reads the first date a bucket hits its target.
`bucketsStateSchema` is the zod boundary. Over-allocation is surfaced in the UI, not
rejected at the schema.

> **The recurrence engine (`schedule.ts`) is shared** — `investments` contributions and
> `spending` recurring expenses reuse `occurrences` / `addMonths` / `startOfDay` / `toISO`
> from here rather than reinventing scheduling. It also owns **`cadenceLabel(recurrence)`** —
> the human label for a `{ freq, interval }` cadence ("Weekly", "Fortnightly", "Quarterly",
> "Every 5 weeks") — so every Component that speaks the cadence language shares one vocabulary
> (spending re-exports it; the investments holding card lower-cases it for its contribution chip).

See `src/lib/CLAUDE.md` for shared conventions; `docs/architecture/components/buckets.md`
for the generated structural view.
