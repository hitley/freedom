# UI — `src/components/`

The React UI (the **Elements** of each Component: `*Panel`s, widgets, `*Editor`/`*Modal`s, and
the shared detail shell). `FreedomApp` orchestrates the Financial Domain.

## How data flows

**All components are persisted per-instance** — `page.tsx` loads `inputs` / `vision` / `buckets`
/ `investments` / `spending` plus the `inbox` list server-side (`Promise.all` of the
`load*`/`listInbox` DAL fns) and passes them as initial props; `FreedomApp` saves changes
through the matching `save*Action` props. The inbox differs: it's a live per-row queue, so
capture/dismiss go straight through `addInboxItemAction` / `dismissInboxItemAction` (which
`revalidatePath` the route), updating the local list from the result rather than debounced-saving
a document; a pending CSV item also has a **Process** action (`processInboxItemAction`) that runs
Extract, and a proposal's **Reconcile** (`reconcileInboxItemAction`) returns *both* the applied
item and the new spending state so `FreedomApp` updates the inbox and the ledger in one go.
`inputs`, `buckets`, `investments`, and `spending` save **debounced** (via the `useDebouncedSave`
hook, which skips the first run so seeding doesn't write back); the `vision` is saved
**explicitly** when the capture flow completes. Each `load*` returns `null` for a fresh instance,
so the UI falls back to `DEFAULT_INPUTS` / onboarding / the illustrative seeds. The home page is
**auth-gated** (`page.tsx` redirects to `/signin` without a session; `src/app/signin/page.tsx` is
the Google sign-in; a sign-out form sits in the header).

## Vision modal + the View toggle

The **vision is a dismissible modal, not page furniture** (it was eating the top of the page):
`FreedomApp` holds a `visionOpen` flag that **opens on every first load** and is reachable
thereafter via a **Vision** option that sits as the first item in the view toggle (it triggers
the modal rather than switching the inline view, so it never takes an active state). The modal
uses the same overlay chrome as the editors (click-off anywhere to dismiss); it shows the
read-only `VisionPanel` when a vision exists (its Edit button re-enters the flow), or the guided
`onboarding/VisionOnboarding` flow directly when none is set yet. Completing the flow saves and
closes it.

The **Vision | Trajectory | Investments | Buckets | Spending | Inbox** toggle (the `FinancialView`
union) drives: `FinancialDashboard` (controlled `inputs`/`proj`; the captured goal seeds its
annual spend). The dashboard's **Reality** group no longer dials in "Invested today" / "Saved per
month" — those are **derived from the Investments component** (portfolio `totalValue` and
`annualContributions ÷ 12` via `summariseInvestments`, merged into `effectiveInputs` in
`FreedomApp` so the projection tracks the real portfolio) and render read-only with a "From
Investments →" link that switches to that view; only `currentAge` stays an editable dial there.
The **Real return** in Assumptions is likewise **derived by default** — `summariseInvestments`'
`blendedReturnPct` (value-weighted holding returns) feeds `effectiveInputs.realReturnPct`, so the
Trajectory and the whole-portfolio projection use the *same* growth rate and can't disagree. An
**Auto/Custom toggle** (`ReturnControl`) flips it to a manual slider to play; switching to Custom
seeds the dial with the derived value so overriding starts where derive left off. The derive
state is local (defaults to Auto each load), not persisted.
Then `buckets/BucketsPanel`, `investments/InvestmentsPanel` (portfolio value + by-kind breakdown +
1-year look-ahead, with `investments/HoldingEditor` as the add/edit modal — which also captures
the per-holding `history`). The holding's **recurring contribution** uses the same friendly
**cadence picker** as spending (Weekly/Fortnightly/Monthly/Quarterly/Yearly/Once → the
recurrence engine's `{ freq, interval }`, with a weekday or day-of-month field), a **start
date**, and an **ends** control (Never / On date / After N times — the last writes
`recurrence.count`). The holding cards **drag-to-reorder** via the shared `useReorder`
hook (`src/components/useReorder.ts`, native HTML5 DnD with a FLIP glide); buckets cards use the
same. Clicking the **"Projected in 1 year"** summary stat **maximises the whole portfolio** into
`investments/PortfolioDetail` — the same detail shell driven by `projectPortfolio`, with a
horizon selector (1y–30y), extra-contribution + growth-adjustment what-if levers, and the
**magic number drawn as a reference line** (passed down from `FreedomApp` as `magicNumber`) so you
can read the year the portfolio crosses into freedom. Moving a lever overlays the untouched
**"as-is" baseline** as a second muted line (via `ProjectionChart`'s optional `compare` prop) so
the difference is visible at a glance, and the **"Reaches freedom" stat carries a jump-icon**
(`Stat`'s optional `action`) that switches to the Trajectory view (`onViewTrajectory` → `setView`).

## The maximise-to-detail shell (`src/components/detail/`)

Clicking a holding tile **maximises** it into `investments/HoldingDetail`: one timeline showing
the recorded past (solid line, left of a "today" divider) flowing into a dashed projection (right
of it), driven by live what-if sliders (monthly contribution + estimated growth %, seeded from the
holding but non-destructive), with a year-by-year growth breakdown below; "Minimise" returns to
the overview. Its **what-if levers mirror the whole-portfolio view exactly** — "Extra monthly
contribution" (0→5000) and "Growth adjustment" (±10%), both **neutral at rest and layered on top
of** the holding's own contribution + growth (not absolute seeded values). So adding money only
ever grows the projection — it can't dip below the holding's real plan. Move a lever and the
untouched **as-is** baseline overlays as a muted line (`ProjectionChart`'s `compare` prop) with the
headline hint switching to "±N vs as-is". The y-axis is **pinned stable** via `ProjectionChart`'s
`axisMax` — sized to the projection at the *maximum* extra contribution — so dragging the
contribution lever grows the line into a fixed frame instead of rescaling the axis under it (the
portfolio gets this for free from its magic-number reference line; holdings have no such anchor, so
they compute the ceiling). Keeping the two levers identical to `PortfolioDetail`'s is deliberate:
the single-holding and whole-portfolio projections must behave the same way. This **maximise-to-detail interaction is a reusable shell**: `DetailShell` (the
glyph/title/subtitle header + Edit/Minimise chrome), `ProjectionChart` (the generic past+projected
SVG — today divider, gridlines, hover scrubber, optional horizontal `reference` line, an optional
`compare` baseline line, an optional `axisMax` floor that pins the y-axis so what-if drags don't
rescale it, with a View-supplied `tooltipLines(series, idx)` callback) plus its `HorizonSelector`,
and `primitives`
(`Stat`, `Slider`, `compactMoney`). `HoldingDetail` is built on it, and so is the buckets
equivalent.

A panel holds a `detailId` state; when set it renders `<DetailShell>` (header + Minimise) wrapping
headline `Stat`s, a `<ProjectionChart>` (pass `actual`/`projected` point arrays, a `tooltipLines`
callback, an optional `reference` line, a `HorizonSelector` as `headerRight`), and `Slider`
what-if levers. Cards become clickable (`role="button"` + `onClick` setting `detailId`); the
card's Edit button `stopPropagation`s. **Don't rebuild the SVG chart, scrubber, or `Stat`/`Slider`
per Component** — `HoldingDetail` and `BucketDetail` are the worked examples.

## The Views

The buckets view leads with `buckets/BucketsTimeline` (a hand-built SVG look-ahead chart of
projected balances, with a horizon selector and hover scrubber), an accounts strip with an "as
of" selector that projects each account forward, and bucket cards; clicking a card **maximises**
it into `buckets/BucketDetail` (same shell) — a forward-only projection of that single bucket's
balance (via `simulate`), with the goal drawn as a reference line, the projected hit date in the
headline, and a live "extra monthly contribution" what-if lever (a synthetic `in` cashflow) that
shows how much sooner the goal lands. The y-axis is **pinned** (`ProjectionChart`'s `axisMax`,
sized to the projection at the max extra contribution) so dragging the lever grows the line into a
fixed frame instead of rescaling it — same as the holding/portfolio views. `BucketEditor` /
`AccountsEditor` are modals. `BucketEditor` holds name/icon/goal, the allocation slices, per-bucket
scheduled payments, **and a "Funded from" account select** (`sourceAccountId`). **`AccountsEditor`**
now expands each account to edit its **flows** (recurring money in/out — salary, bills) and an
optional **auto-funding plan** (a strategy toggle — Target dates / Priority / Even split — sweeping
either "whatever's spare" or a fixed amount, on a cadence); both feed `simulate`, so the accounts
strip's as-of projection and the timeline reflect them automatically. See
[design-notes/006](../../design-notes/006-dynamic-accounts-and-bucket-funding.md); cross-component
derivation (investment/mortgage outflows) is a later slice. Buckets are independent of the freedom
projection engine for now — feeding bucket totals into the engine is a future step.

The **Spending** view (`spending/SpendingPanel`) leads with the **annualised-spend** headline
compared against the vision's target spend, a by-category breakdown bar, then a **Planned** section
— the bottom-up budget of recurring expenses: a **monthly-budget** headline (`budgetSummary`,
shown beside the observed annualised figure for contrast), a by-category budget bar, the
commitment list (each row its cadence label + per-payment estimate + monthly-equivalent; click to
edit, paused ones dimmed), and a **Coming up** list of the next due occurrences (`dueOccurrences`,
~3 months). `spending/RecurringExpenseEditor` is its add/edit modal — payee, estimate, a
`fixed`/`estimated` toggle, a friendly **cadence picker** (Weekly/Fortnightly/Monthly/Quarterly/
Half-yearly/Yearly presets that map to the recurrence engine's `{ freq, interval }`, with a
day-of-month or weekday field), start date, and spend-only category chips. A **Reconcile** button
(when commitments exist) opens `spending/ReconcileModal`: the expected occurrences over the recent
window (last 2 months → next), each a status chip (`matched` with a variance chip / `outstanding`
/ `upcoming`); a matched row shows its actual + **Unlink**, an unmatched row surfaces the top
**suggested** actual ("Looks like … · Confirm") that stamps `transaction.recurring` on confirm.
Below that the transaction list (newest-first; click a row to edit); `spending/TransactionEditor`
is its add/edit modal. Manual entry today — imported statement rows will reconcile into the same
list once the ingestion inbox lands.

The **Inbox** view (`inbox/InboxPanel`) is the head of that pipeline: a capture card (source
toggle, CSV upload **or** paste, or a free-text note) that queues a `pending` item, above the
queue list with per-item status chips, a **Process** button on pending CSV items, and dismiss.
Processing a CSV runs the Extract stage and shows an inline "N transactions ready to review"
summary (deduped count + spend total) on the now-`proposed` item; a **Review** button opens
`inbox/ReviewModal`, where each draft can be re-categorised or dropped before approving the rest
into the spending ledger (`onReconcile` → the item goes `applied` and the new transactions appear
in the Spending view, tagged "imported").

## Element conventions

- **A maximised detail view = the shared shell** (above). Reuse `DetailShell` / `ProjectionChart`
  / `primitives`; don't rebuild them per View.
- **Shared form primitives** live in `src/components/forms/primitives.tsx` (`Field`, `MoneyInput`,
  `NumberInput`, `PercentInput`, `Select`, `DateInput`, `DatePicker`) — import them into editor
  modals rather than re-defining; they're pure presentational field controls. The three numeric
  inputs keep an **internal draft string** (`useNumericDraft`) so cents survive even when the
  parent stores a `number` and feeds back `String(n)` — without it a trailing decimal point
  (`"12."` → `12` → `"12"`) gets wiped mid-keystroke and only whole numbers can be typed (this
  was the bug in `HoldingEditor`'s recurring contribution, which round-trips through `Number`). View-specific
  sub-forms (toggles, cashflow/history rows) stay in their editor. **Date entry is the custom
  `DatePicker`** (`src/components/forms/DatePicker.tsx`), not a native `<input type="date">`: a
  calendar popover with **day → month → year** drill-down (click the header to zoom out, pick a
  cell to zoom back in), rendered through a portal so an editor modal's scroll can't clip it, with
  ISO `YYYY-MM-DD` in/out via the recurrence engine's `parseISO`/`toISO` (local midnight, no UTC
  drift). `DateInput` is a thin wrapper over it, so every date field — including the former bespoke
  inline ones in `HoldingEditor` (history rows) and `TransactionEditor` — is now the same control.
- **Tailwind exposes only the base palette** (`emerald`, `gold`, `muted`, `surface`, `surface-2`,
  `border`, `foreground` — see `@theme inline` in `globals.css`). There is **no** `-dim` utility;
  shade with opacity (`bg-emerald/50`), not `bg-emerald-dim`.
- **Previewing locally:** the app's dev server runs on **port 3100** (the launch config
  `freedom-dev` in `.claude/launch.json` pins it, so it never collides with other repos on 3000).
  The Investments/Buckets views only mount **after** the vision onboarding completes — drive that
  flow first when verifying in a browser.
