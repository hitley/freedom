import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests — the top tier of the testing strategy (see
 * `design-notes/002-bdd-testing-and-living-docs.md`). Reserved for the few journeys
 * that only exist when the whole stack is wired: here, the ingestion pipeline driven
 * through the real UI (drop a CSV → Process → Review → it lands in Spending).
 *
 * These need a running app *and* a database. The dev server is launched on port 3100
 * (matching `.claude/launch.json`) with `AUTH_DEV_BYPASS=true`, so Google sign-in is
 * skipped and the suite runs as the fixed local dev user — but a real `DATABASE_URL`
 * must still be present in `.env.local` (Next loads it). `global-setup.ts` fails fast
 * with guidance if it isn't, so the failure is legible rather than a wall of timeouts.
 */
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: { AUTH_DEV_BYPASS: "true" },
  },
});
