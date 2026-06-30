# 📊 Finance engine

_Pure freedom math: magic number, coast number, the month-by-month projection._

::: tip Generated from source
This page is generated from the code: file descriptions come from each file's header comment, the model from `types.ts`, and the behaviours from the `@source` tags on the feature specs. Improve the code's comments to enrich it.
:::

## Elements

### Core (pure)

| File | Responsibility |
| --- | --- |
| `index.ts` | _—_ |
| `projection.ts` | _—_ |
| `types.ts` | Component types for the Finance engine — the freedom math of the Financial Domain. |

### Access layer (server)

| File | Responsibility |
| --- | --- |
| `financial-profile.ts` | _—_ |

### UI

| File | Responsibility |
| --- | --- |
| `FinancialDashboard.tsx` | _—_ |
| `ProjectionChart.tsx` | _—_ |

## Model

The data types this Component owns (from `types.ts`).

| Type | Kind | Description |
| --- | --- | --- |
| `FireStyle` | type | A FIRE flavour. Affects how the target spend (and thus magic number) is framed. |
| `FinancialInputs` | interface | The inputs a user provides to compute their financial-freedom trajectory. |
| `ProjectionPoint` | interface | One point on the projected portfolio path. |
| `Projection` | interface | The computed trajectory toward financial freedom. |

## Behaviours

_No behavioural specs target this Component yet._
