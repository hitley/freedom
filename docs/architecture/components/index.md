# Components (C3)

The **Components** of the Financial Domain — each surfaced as a View in the app (Vision, Trajectory, Investments, Buckets, Spending, Inbox). A Component is a set of **Elements**: its core (pure) model, its server access layer, and its UI — with the model it owns and the behaviours that validate it. Generated from the source; see each page.

| Component | What it owns |
| --- | --- |
| [🧭 Vision](/architecture/components/vision) | Project the goal and why it matters — step one of every freedom Domain. |
| [📊 Finance engine](/architecture/components/finance) | Pure freedom math: magic number, coast number, the month-by-month projection. |
| [🪣 Buckets](/architecture/components/buckets) | A virtual layer of purpose over the real accounts money lives in. |
| [📈 Investments](/architecture/components/investments) | The freedom-generating assets the user holds, valued and projected forward. |
| [💸 Spending](/architecture/components/spending) | The user's observed outgoings and income — the data behind annualised spend. |
| [📥 Inbox & ingestion](/architecture/components/inbox) | The durable queue and pipeline at the head of the bookkeeper: capture → extract → propose → reconcile. |
