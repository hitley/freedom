import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Two flavours of test run under Vitest here:
 *
 *  - **Unit tests** target the pure `src/lib` domains (no React, no DB), so a plain
 *    Node environment is all we need (`src/**\/*.test.ts`).
 *  - **Behavioural specs** are Gherkin `.feature` files under `features/`, bound to
 *    step definitions in `*.steps.ts` via `@amiceli/vitest-cucumber`. The `.feature`
 *    files are the source of truth (and the seed for the future VitePress docs); the
 *    `.steps.ts` files are what Vitest actually runs, so they're included below.
 *    See `design-notes/002-bdd-testing-and-living-docs.md`.
 *
 * The `@` alias mirrors tsconfig's paths so both import the same way the app does.
 * `server-only` is aliased to an empty module: the ingestion specs exercise the
 * server-side pipeline (`extract.ts` / `reconcile.ts`), which guard themselves with
 * `import "server-only"` — harmless in an RSC build, but it throws under Node. The
 * DAL it talks to is swapped for an in-memory fake in the steps, so no DB is touched.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "features/**/*.steps.ts"],
  },
});
