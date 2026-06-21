import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next, so it doesn't auto-load .env.local. Pull it in
// (Node 20.12+ built-in) so DATABASE_URL is available to migrate/generate/push.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI uses real env vars) — fall through to process.env.
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
