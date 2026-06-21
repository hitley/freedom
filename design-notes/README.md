# Design notes

A running history of architecture & design conversations — the *thinking*, not the
final state. This folder is **gitignored for now** (see `.gitignore`): it's a personal
scratchpad of decisions and their rationale, not committed project docs.

## How this differs from the committed docs

- `CLAUDE.md` / `AGENTS.md` — what **exists** right now (kept current as things ship).
- `ROADMAP.md` — what's **next** and why (committed).
- `design-notes/` — **how we got there**: the options weighed, the forks chosen, the
  trade-offs, the things deliberately deferred. A decision log, not a spec.

When a design here gets built, fold the durable facts into `CLAUDE.md` and the
forward-looking bits into `ROADMAP.md`. The note stays as the historical record of
*why*.

## Convention

- One file per conversation/decision: `NNN-short-slug.md` (zero-padded, incrementing).
- Start with a metadata block: date, status (`exploring` / `decided` / `building` /
  `shipped` / `superseded`), and a one-line summary.
- Capture the **decisions and their reasons**, the **forks** and which way they went,
  and what was **explicitly deferred**. Skip transcript-level detail.
- Update the status line as reality moves; link superseding notes when one replaces
  another.

## Index

- [001 — Async ingestion inbox & bookkeeper pipeline](001-ingestion-inbox-bookkeeper.md)
