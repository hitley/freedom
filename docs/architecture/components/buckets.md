# 🪣 Buckets

_A virtual layer of purpose over the real accounts money lives in._

::: tip Generated from source
This page is generated from the code: file descriptions come from each file's header comment, the model from `types.ts`, and the behaviours from the `@source` tags on the feature specs. Improve the code's comments to enrich it.
:::

## Elements

### Core (pure)

| File | Responsibility |
| --- | --- |
| `index.ts` | _—_ |
| `schedule.ts` | Recurrence engine for scheduled bucket payments. |
| `types.ts` | Component types for financial **buckets** — a virtual layer of *purpose* over the real accounts money actually lives in. |

### Access layer (server)

| File | Responsibility |
| --- | --- |
| `buckets.ts` | _—_ |

### UI

| File | Responsibility |
| --- | --- |
| `AccountsEditor.tsx` | _—_ |
| `BucketDetail.tsx` | _—_ |
| `BucketEditor.tsx` | _—_ |
| `BucketsPanel.tsx` | _—_ |
| `BucketsTimeline.tsx` | _—_ |

## Model

The data types this Component owns (from `types.ts`).

| Type | Kind | Description |
| --- | --- | --- |
| `AccountKind` | type | Where money physically lives. `offset` is the mortgage-offset case that motivated this. |
| `Account` | interface | A real place money sits, with the balance the user reports for it. |
| `Allocation` | interface | A slice of one account assigned to a bucket. Bucket balance = sum of these. |
| `RecurrenceFreq` | type | How often a scheduled payment repeats. |
| `Recurrence` | interface | When a scheduled payment happens. Date fields are date-only ISO strings (`YYYY-MM-DD`) — see `schedule.ts` for how these expand into actual dates. |
| `FlowKind` | type | Direction of a scheduled payment: money into a bucket, or spent out of it. |
| `Cashflow` | interface | A scheduled movement of money for a bucket, flowing through a real account. |
| `Bucket` | interface | A purpose envelope. Its money may be spread across one or more accounts. |
| `BucketsState` | interface | The full client-side state: the accounts and the buckets carved from them. |
| `BucketView` | interface | A bucket enriched with the today-snapshot figures the UI needs. |
| `AccountView` | interface | An account enriched with how much of it is spoken for. |
| `BucketsSummary` | interface | Whole-state rollup for the summary header. |

## Behaviours

_No behavioural specs target this Component yet._
