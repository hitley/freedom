# C2 · Containers

In this app's DDD reading, the **C2 "containers" are the bounded contexts** — the logical
modules the code is organised into — rather than separate deployable units (everything
ships as one Next.js app on Vercel, with the docs as a static site beside it). Each context
owns its model, its rules, and its slice of the UI, and depends **inward only**.

## The big picture

```mermaid
flowchart TD
  user([User])

  subgraph web["Web app · Next.js / React / Vercel"]
    direction TB
    ui["UI &amp; server actions<br/>FreedomApp + per-context panels"]

    subgraph contexts["Bounded contexts"]
      direction LR
      vision["🧭 Vision"]
      finance["📊 Finance engine"]
      buckets["🪣 Buckets"]
      investments["📈 Investments"]
      spending["💸 Spending"]
      inbox["📥 Inbox &amp; ingestion"]
    end

    auth["🔐 Auth &amp; tenancy<br/>(instance = workspace)"]
    dal["Access layer (DAL)<br/>src/lib/server"]
  end

  db[("Neon Postgres")]
  google([Google OAuth])
  docs["📚 Docs site<br/>VitePress → /docs"]

  user --> ui
  ui --> contexts
  contexts --> dal
  ui --> auth
  auth --> google
  dal --> auth
  dal --> db
  inbox -. "reconciles into" .-> spending
  investments -. "feeds totals into" .-> finance

  docs -. "generated from" .-> contexts
```

_Solid arrows are runtime dependencies; dashed arrows are domain relationships and the
docs-generation link._

## The contexts

| Context | Responsibility | Depends on |
|---------|----------------|------------|
| [🧭 Vision](./components/vision) | The goal and *why* — headline, motivations, FIRE style, target spend. | Finance (FIRE style) |
| [📊 Finance engine](./components/finance) | Pure freedom math: magic number, coast number, projection. | — (pure) |
| [🪣 Buckets](./components/buckets) | Purpose envelopes over real accounts; a recurrence + simulation engine. | — (pure) |
| [📈 Investments](./components/investments) | Holdings, valuation, contributions, DRP, projection. | Buckets (recurrence engine) |
| [💸 Spending](./components/spending) | Observed transactions; annualised spend; the CSV parser. | — (pure) |
| [📥 Inbox & ingestion](./components/inbox) | The capture → extract → propose → reconcile pipeline. | Spending (reconcile target) |
| 🔐 Auth & tenancy | Identity (Auth.js + Google), the instance/workspace model, the authorization choke-point. | Google, Postgres |

## Cross-cutting rules

These hold across every context — they're why the model stays modular:

- **Dependencies point inward.** UI → DAL → domain. A `src/lib/<domain>` imports nothing
  framework- or IO-bound, so it's pure and unit-testable.
- **The DAL is the only door to data** (`src/lib/server`). It resolves the instance from
  the session and validates every read/write through the context's zod schema — there is
  no client-supplied id surface. See [C4 · Data model](./data-model).
- **Shared engines, not duplication.** The buckets **recurrence engine** and the
  **detail-view shell** are reused across contexts rather than re-implemented.
- **Each context is validated by behaviours.** Its [component page](./components/) links to
  the executable [specs](/features/) that pin its rules.

---

Continue to **[C3 · Components →](./components/)**, or jump to **[C4 · Data model →](./data-model)**.
