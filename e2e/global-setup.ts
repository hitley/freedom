import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Fail fast — with a useful message — when the e2e prerequisites aren't met. The
 * journey tests drive the real app, which needs a database; `.env.local` must carry
 * a `DATABASE_URL`. Without this guard a missing DB surfaces as opaque navigation
 * timeouts much later. We also nudge `AUTH_DEV_BYPASS` on (the webServer sets it too).
 */
export default function globalSetup() {
  const envPath = path.join(__dirname, "..", ".env.local");

  let env = "";
  try {
    env = readFileSync(envPath, "utf8");
  } catch {
    throw new Error(
      "e2e: .env.local not found. The journey tests run the real app and need a " +
        "database. Copy .env.example to .env.local and set DATABASE_URL (a Neon " +
        "Postgres or local Postgres), then run the migrations: `npx drizzle-kit migrate`.",
    );
  }

  const hasDbUrl = /^\s*DATABASE_URL\s*=\s*["']?\S+/m.test(env);
  if (!hasDbUrl) {
    throw new Error(
      "e2e: DATABASE_URL is not set in .env.local. Point it at a disposable test " +
        "Postgres (e.g. a Neon branch) and run `npx drizzle-kit migrate` before the suite.",
    );
  }

  process.env.AUTH_DEV_BYPASS = "true";
}
