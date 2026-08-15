# Behaviour & living docs — `features/`

Gherkin specs that pin *intended behaviour*, and double as the seed for the generated docs.

## Two tiers (design in `design-notes/002-bdd-testing-and-living-docs.md`)

Tier 1 lives in `features/<capability>/`: a `.feature` file (user-facing prose + Given/When/Then)
+ a `*.steps.ts` binding it via `@amiceli/vitest-cucumber`, run by Vitest. Two shapes:
- **pure component** (steps call the helpers directly, no infra — `features/spending/`), and
- **server pipeline** (drives the real `extract.ts`/`reconcile.ts` with the DAL swapped for
  `features/support/dal-fake.ts` via `vi.mock`; `server-only` is aliased to a stub in
  `vitest.config.ts`).

Tier 2 is Playwright (`e2e/`) for the few full-stack journeys only — rationed, not a regression
net. Step text uses cucumber expressions (`{string}`, `{number}`); `And` steps must be registered
with `And` (matching is type-sensitive). Prefer adding a scenario to an existing feature over a new
unit test when you're pinning *intended behaviour*.

## The `.feature` files are also the docs

They generate the VitePress site served at `/docs` (`scripts/feature-docs.mjs` parses them with
the *same* `loadFeature`; output is the committed `docs/features/**` Markdown, built into
`public/docs`). So: write the `Feature:` block as user-facing prose, and tag each feature with
`@source:<path>` lines naming the application paths it validates. A **PostToolUse hook**
(`scripts/claude-feature-hook.mjs`, `.claude/settings.json`) auto-regenerates the docs and runs
the affected specs when you edit a `.feature` or a tagged `src/` path — if you change a `.feature`,
commit the regenerated `docs/features/**` alongside it (`npm run docs:check` enforces this). Add a
`@source` tag when a new spec covers a path, or the hook will flag that path as uncovered.

## Docs are organised by the C4 model, mapped onto the DDD structure

(The preferred style — see https://c4model.com.) Four altitudes, broadest first — matching the
**Domain → Component → Element** taxonomy (see root `CLAUDE.md`):
- **C1 Context** — *why* the app exists and the external actors it talks to (the User/owner,
  Google as identity provider, Neon Postgres, future Open-Banking/market-data feeds);
- **C2 Containers** — the **Domains**: Financial (built), Time, Health (slots). Cross-cutting
  infrastructure (auth/tenancy, the web app, the docs site) sits beside them, not as a Domain;
- **C3 Components** — the **modules of a Domain** (vision, finance/Trajectory, buckets,
  investments, spending, inbox), each a `src/lib/<component>` + its UI (a **View** in code),
  cross-linked to the **behaviours** (`.feature` pages) that validate it via the `@source` map;
- **C4 Code** — a Component's **Elements**: the four-file `types`/`index`/`*Panel`/`*Editor`, the
  DAL, shared engines (the recurrence engine + the detail shell), the model types, and the
  **database schema** (`docs/architecture/data-model.md`).

The Gherkin behaviours are the **dynamic** view; C4 is the **structural** view — keep them as two
complementary axes rather than collapsing one into the other. **The C3/C4 pages are generated, not
hand-written** (`scripts/arch-docs.mjs` + `generate-arch-docs.mjs`): C1/C2
(`docs/architecture/index.md` + `containers.md`) are hand-authored with **Mermaid** C4 diagrams,
but each C3 Component page is built from the source — file *Responsibility* cells come from each
file's **header comment**, the *Model* table from the Component's `types.ts` doc-comments, and
*Behaviours* from the `@source`→feature map. To document a new Component, add it to the `CONTEXTS`
manifest in `arch-docs.mjs`; to enrich an existing page, **improve the code's header comments /
type docs** (the generator rewards better names and comments — a file with no header shows `—`).
`check-arch-docs.mjs` guards staleness. **Don't restate `.feature` files verbatim** — reference
the behaviour, summarise the intent.
