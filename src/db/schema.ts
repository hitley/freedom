import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  primaryKey,
  uuid,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* ----------------------------------------------------------------------------
 * Auth.js (self-hosted) tables — standard shape expected by @auth/drizzle-adapter.
 * Identity lives entirely in our own database; Google is just the sign-in method.
 * ------------------------------------------------------------------------- */

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

/* ----------------------------------------------------------------------------
 * App tables — multi-tenant. An "instance" is a workspace (yourself, a family,
 * someone you share with later). Every piece of user data hangs off an instance,
 * and every instance has an owner. Authorization is always checked server-side.
 * ------------------------------------------------------------------------- */

export const instances = pgTable("instance", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Financial-freedom profile for an instance — the inputs the engine runs on.
 * NOTE: monetary figures are stored as numeric for now. Field-level encryption
 * of these is a planned hardening step before any real/shared data lands.
 */
export const financialProfiles = pgTable("financial_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  // One financial profile per instance — unique so the save path can upsert on it.
  instanceId: uuid("instance_id")
    .notNull()
    .unique()
    .references(() => instances.id, { onDelete: "cascade" }),
  currentInvested: numeric("current_invested", { mode: "number" }).notNull().default(0),
  monthlyContribution: numeric("monthly_contribution", { mode: "number" }).notNull().default(0),
  annualSpend: numeric("annual_spend", { mode: "number" }).notNull().default(0),
  realReturnPct: numeric("real_return_pct", { mode: "number" }).notNull().default(5),
  withdrawalRatePct: numeric("withdrawal_rate_pct", { mode: "number" }).notNull().default(4),
  ongoingAnnualIncome: numeric("ongoing_annual_income", { mode: "number" }).default(0),
  currentAge: integer("current_age"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Document-per-Component state for an instance. The vision / buckets / investments
 * Components are each a nested document the app reads and writes whole, with a zod
 * schema (`freedomVisionSchema` / `bucketsStateSchema` / `investmentsStateSchema`)
 * as the validation boundary — so we store the validated blob in a `jsonb` column
 * rather than normalising into relational tables. One row per instance
 * (`instanceId` unique) so the save path upserts. The `data` column is left
 * untyped here; the DAL parses it through the Component's zod schema on read/write.
 * (These all belong to the Financial Domain; a `domain` discriminator column is the
 * future seam when the Time / Health Domains land — not built yet.)
 */
export const visionStates = pgTable("vision_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  instanceId: uuid("instance_id")
    .notNull()
    .unique()
    .references(() => instances.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const bucketsStates = pgTable("buckets_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  instanceId: uuid("instance_id")
    .notNull()
    .unique()
    .references(() => instances.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const investmentsStates = pgTable("investments_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  instanceId: uuid("instance_id")
    .notNull()
    .unique()
    .references(() => instances.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const spendingStates = pgTable("spending_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  instanceId: uuid("instance_id")
    .notNull()
    .unique()
    .references(() => instances.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Ingestion inbox — the durable queue at the head of the bookkeeper pipeline. Unlike
 * the jsonb-document tables above, this is **one row per dropped artifact** with an
 * independent lifecycle (`status`), processed asynchronously. `raw` holds the artifact
 * inline (CSV/text) for now; binaries move to blob storage with a reference later. The
 * `(instance_id, status)` index serves the two hot queries: an instance's inbox list,
 * and a processor draining `pending` items. See `src/lib/inbox` + `src/lib/server/inbox.ts`.
 */
export const inboxItems = pgTable(
  "inbox_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    label: text("label").notNull(),
    raw: text("raw").notNull(),
    status: text("status").notNull().default("pending"),
    extracted: jsonb("extracted"),
    error: text("error"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { mode: "date" }),
  },
  (t) => [index("inbox_item_instance_status_idx").on(t.instanceId, t.status)],
);
