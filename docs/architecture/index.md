# C1 · Context

> **The C4 model, top-down.** This **Architecture** section is the *structural* view of
> Freedom, organised by [C4](https://c4model.com): **C1 Context** (this page) → **C2
> [Containers](./containers)** (the bounded contexts) → **C3 [Components](./components/)**
> (generated per context) → **C4 [Data model](./data-model)** (the schema). It complements
> the [Behaviours](/features/) section, which is the *dynamic* view — what the app does,
> as executable specs. Structure and behaviour, cross-linked.

## Why Freedom exists

Freedom is a private, personal app to **define and track three dimensions of personal
freedom**. For each dimension you (1) project your goals and *why* they matter, (2) capture
your current state, then (3) track the trajectory and ETA to the goal — visual and
interactive, not a spreadsheet.

The dimension built today is **financial freedom**: capture the vision and target spend,
work out the "magic number", record net worth and holdings, and see the projected
**freedom date**. Time and Health are slots in the same framework, not yet built.

It is **private, per-user data** behind a real full-stack app — auth, a database, and
multi-tenancy from day one — not a static toy.

## System context

```mermaid
C4Context
  title System context — Freedom

  Person(user, "User / owner", "Defines and tracks their freedom; the only person who can see their data")

  System(freedom, "Freedom", "Define & track three dimensions of personal freedom. Next.js app on Vercel.")

  System_Ext(google, "Google", "OAuth identity provider — the only sign-in method")
  SystemDb_Ext(neon, "Neon Postgres", "Private per-user data (identity, instances, finance documents)")

  Rel(user, freedom, "Uses", "HTTPS")
  Rel(freedom, google, "Signs in via", "OAuth 2.0")
  Rel(freedom, neon, "Reads / writes", "SQL over TLS")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

### Actors & external systems

| Actor / system | Role |
|----------------|------|
| **User / owner** | The signed-in person. Sees only their own workspace(s); authorization is owner-only today. |
| **Google** | OAuth identity provider — the sole sign-in method. We store only the identity link, never a password. Sign-in is allowlisted (`AUTH_ALLOWED_EMAILS`). |
| **Neon Postgres** | The system of record. All user data is multi-tenant and segregated by instance. |

### Planned external systems (not wired yet)

| System | Future role |
|--------|-------------|
| **Open Banking / Plaid** | Automated transaction ingestion, behind the existing inbox seam. |
| **Market-data / broker feed** | Live holding prices, behind the `PriceProvider` seam. |

Today both are **manual**: statement CSVs are dropped into the [inbox](./components/inbox),
and holding prices are entered by hand.

---

Continue to **[C2 · Containers →](./containers)**.
