# `src/lib/` — pure Component cores + the DAL

This tree holds the **pure logic** of each Component (no React, no DB) plus the
server-only access layer (`server/`). Shared conventions for everything in here:

- **A Component = four files in the same shape** (its Elements; see `buckets`, `investments`):
  `types.ts` (plain data, no imports beyond sibling types), `index.ts` (pure helpers +
  the `zod` boundary schema + `export *` of the types), then UI as a `*Panel`
  (summary + list, owns no state — parent passes `state` + `onChange`) and an
  `*Editor` **modal** (assembles one item, returns it via `onSave`). Reuse the
  recurrence engine (`occurrences`, `addMonths`, `startOfDay`, `toISO`) from
  `@/lib/buckets` rather than reinventing scheduling.
- **Test the pure core, not the UI.** Each `src/lib/<component>` gets an
  `index.test.ts` next to it (Vitest, Node env, `@` alias works). The Components' cores are
  designed I/O-free precisely so this is cheap — add cases when you add helpers.
- **Keep the design modular and DDD-aligned.** One **Component per
  `src/lib/<component>`** (the four-file shape is its module boundary); dependencies point
  **inward** — UI → DAL → Component core, and the core imports nothing framework/IO. New
  concepts get their own Component rather than bolting onto an existing one.
- `server/` is the exception: it's the **DAL** (data-access layer), not a domain Component —
  see `src/lib/server/CLAUDE.md`.

Each Component's deep notes live in its own folder `CLAUDE.md` (loaded when you work there);
its *structural* view (file-responsibility tables) is the generated
`docs/architecture/components/<id>.md`.
