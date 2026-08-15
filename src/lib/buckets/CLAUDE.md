# Buckets — `src/lib/buckets/`

The Buckets Component: pure data + helpers for a virtual layer of *purpose* over real
accounts. You record each `Account`'s balance, then carve `Allocation` slices into purpose
`Bucket`s; a bucket can draw from several accounts. Today-snapshot helpers (`bucketView`,
`accountView`, `summarise`) derive each bucket's balance / % funded and — the key insight —
each account's **unallocated remainder** (money with no purpose, e.g. spare cash in a
mortgage offset). Buckets also carry **`Cashflow`s** (scheduled money in/out): `schedule.ts`
is a pure recurrence engine (`occurrences` for once / weekly-on-weekday / monthly-on-day,
with intervals + end dates, plus date utils), and `simulate(state, from, to)` replays every
cashflow chronologically into a **`Timeline`** of bucket & account balances over time. A
dated **`out` + `drain`** flow models a spend event (e.g. a holiday) that empties the bucket
on its date; `projectedTargetDate` reads the first date a bucket hits its target.
`bucketsStateSchema` is the zod boundary. Over-allocation is surfaced in the UI, not
rejected at the schema.

> **The recurrence engine (`schedule.ts`) is shared** — `investments` contributions and
> `spending` recurring expenses reuse `occurrences` / `addMonths` / `startOfDay` / `toISO`
> from here rather than reinventing scheduling.

See `src/lib/CLAUDE.md` for shared conventions; `docs/architecture/components/buckets.md`
for the generated structural view.
