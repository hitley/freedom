# Access layer (DAL) — `src/lib/server/`

The server-only data-access layer. This is the **authorization choke-point** — every read
resolves the instance from the session, so there's no IDOR surface. A **write** may name the
instance it targets (`save*(input, expectedInstanceId?)` → `resolveWriteInstance`), but that id is
**ownership-checked through `requireInstance`** before anything is written — so it still can't
reach another owner's rows, and with no id it falls back to the session's active instance. This
binding exists to fix a real bug: saves are **debounced on the client**, and a save that flushes
*after* the user switches workspace used to resolve the *now-active* instance and write the old
workspace's document into it (a cross-workspace data leak — buckets showing another workspace's
buckets). Binding each save to the instance its data was loaded for (`activeInstanceId`, which the
page keys `FreedomApp` by, so it's stable per mount) makes a stale flush land on the right
workspace. Every component's `save*` + its `save*Action` thread this id through.

`instance.ts` is the centre: `requireUser` (cached `auth()`), `getDefaultInstance` (read-only;
`null` if none), `getOrCreateDefaultInstance` (write-path only — lazily provisions the workspace
on first save, so renders never mutate), and `requireInstance(id)` (ownership check for
client-named instances).

**One owner can hold several workspaces** (their own + a child's, say). Which one is live for a
request is carried by the `freedom.activeInstance` **cookie**, but that value is only ever a
*hint*: `getActiveInstance` / `getOrCreateActiveInstance` re-verify it through `requireInstance`
before touching data — a stale/foreign/tampered cookie silently falls back to the default
workspace, so the cookie can never widen access. **Every Component reads/writes through these
active-instance resolvers**, not the raw `getDefault*` pair. `listOwnedInstances` powers the
header switcher; `switchActiveInstance(id)` (ownership-checked) and `createAndActivateInstance(name)`
set the cookie and are the only mutation helpers here — invoked from the `switchWorkspaceAction` /
`createWorkspaceAction` server actions, which `revalidatePath("/")` so the whole page re-renders
against the newly-active instance. This is the same `instanceId` tenancy the schema was built for —
no second database, no auth change; true multi-*member* sharing of one workspace is still the
future work in `ROADMAP.md`.

`financial-profile.ts` was the first component wired through it: `loadFinancialProfile` /
`saveFinancialProfile`, crossing the `financialInputsSchema` zod boundary in *and* out and
upserting on the unique `instanceId`. The `vision`, `buckets`, `investments`, and `spending`
components follow the same shape (`vision.ts` / `buckets.ts` / `investments.ts` / `spending.ts`)
but store a **single jsonb document** per instance (validated through each component's zod schema
on read/write) instead of typed columns — the data is a nested document the app reads/writes
whole.

`inbox.ts` is the exception in **shape** but not in discipline: it's a **multi-row** table, so it
exposes `listInbox` / `addInboxItem` / `getInboxItem` / `setInboxStatus` rather than a load/save
pair, but every read/write still resolves the instance from the session (`getInboxItem`
re-checks ownership via `requireInstance`, and updates are scoped to the resolved instance in the
`WHERE`). `extract.ts` (`processInboxItem`) orchestrates the Extract stage on top of these — read
a `pending` CSV item, parse, dedupe against the loaded spending, write `proposed` drafts back —
and is the same function a cron runner will call. `reconcile.ts` (`reconcileInboxItem`) closes the
loop: validate the approved subset belongs to the item, append to spending, mark `applied`.

Thin `"use server"` actions in `src/app/actions.ts` delegate here; **auth + validation live in
the DAL, never the action.**

Auth itself (`src/auth.ts`, the allowlist, the local-dev bypass in `dev-auth.ts`) is summarised
in the root `CLAUDE.md`. See `docs/architecture/data-model.md` for the persistence view.
