# 🧭 Vision

_Project the goal and why it matters — step one of every freedom dimension._

::: tip Generated from source
This page is generated from the code: file descriptions come from each file's header comment, the model from `types.ts`, and the behaviours from the `@source` tags on the feature specs. Improve the code's comments to enrich it.
:::

## Components

### Domain (pure)

| File | Responsibility |
| --- | --- |
| `index.ts` | _—_ |
| `types.ts` | Domain types for the vision & goal capture phase — step (1) of every freedom dimension: "project your goals and *why* they matter". |

### Access layer (server)

| File | Responsibility |
| --- | --- |
| `vision.ts` | _—_ |

### UI

| File | Responsibility |
| --- | --- |
| `VisionOnboarding.tsx` | _—_ |
| `VisionPanel.tsx` | _—_ |

## Model

The data types this context owns (from `types.ts`).

| Type | Kind | Description |
| --- | --- | --- |
| `FreedomVision` | interface | What a user articulates before any numbers: the picture of freedom, why it matters, and the concrete goal that the financial engine then works toward. |
| `Motivation` | interface | A motivation chip — the human reasons that sit behind a freedom goal. |
| `FireStyleMeta` | interface | Presentation + a sensible default spend for each FIRE flavour. |

## Behaviours

_No behavioural specs target this context yet._
