import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * The database client. One `db` export, two interchangeable drivers chosen at
 * boot by `DATABASE_DRIVER`:
 *
 *  - **Production / Neon** (default): the HTTP serverless driver (`neon-http`)
 *    talking to Neon over `DATABASE_URL`.
 *  - **Local dev** (`DATABASE_DRIVER=pglite`): PGlite — an in-process WASM
 *    Postgres that persists to a folder on disk (`PGLITE_DATA_DIR`, default
 *    `./.pglite`). No server, no Docker, nothing to start. Apply migrations with
 *    `npm run db:local`.
 *
 * Both imports are dynamic so the *unused* driver — in particular PGlite's WASM —
 * never lands in the production bundle. The PGlite client is structurally a
 * superset of what the DAL touches (select / insert / update / query), so it's
 * cast to the Neon type to keep a single `db` type across the data-access layer.
 */

type Schema = typeof schema;

async function createDb(): Promise<NeonHttpDatabase<Schema>> {
  if (process.env.DATABASE_DRIVER === "pglite") {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dataDir = process.env.PGLITE_DATA_DIR ?? "./.pglite";
    return drizzle(new PGlite(dataDir), { schema }) as unknown as NeonHttpDatabase<Schema>;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — add it to .env.local (Neon connection string).");
  }
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { neon } = await import("@neondatabase/serverless");
  return drizzle(neon(connectionString), { schema });
}

export const db = await createDb();
export { schema };
