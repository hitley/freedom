// Apply the Drizzle migrations to the local PGlite database.
//
// `drizzle-kit migrate` talks the Postgres wire protocol to a server; PGlite is
// an in-process, serverless database, so it has no endpoint to point that at.
// Instead we open the same on-disk PGlite data dir the app uses and run the
// committed migrations through Drizzle's PGlite migrator. Idempotent — only
// unapplied migrations run, so it's safe to re-run after `drizzle-kit generate`.
//
//   npm run db:local
//
// Honours PGLITE_DATA_DIR (default ./.pglite) so it lines up with src/db/index.ts.

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const dataDir = process.env.PGLITE_DATA_DIR ?? "./.pglite";

const client = new PGlite(dataDir);
const db = drizzle(client);

await migrate(db, { migrationsFolder: "./drizzle" });
await client.close();

console.log(`✓ migrations applied to PGlite at ${dataDir}`);
