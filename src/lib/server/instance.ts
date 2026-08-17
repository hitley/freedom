import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { instances } from "@/db/schema";
import { getOrCreateDevUser, isAuthBypassed } from "./dev-auth";
import { resolveActiveInstanceId } from "./instance-selection";

/**
 * Server-side access layer for instances (workspaces). Every read/write of user
 * data starts here so authorization lives in one place — never trust a client to
 * name an instance it doesn't own.
 *
 * An owner can hold *several* workspaces (e.g. their own + a child's). Which one
 * is live for a request is carried by the active-instance cookie, but that value
 * is only ever a *hint*: `getActiveInstance` re-checks ownership through
 * `requireInstance` before any data is touched, so a tampered cookie can never
 * reach another owner's rows. The cookie is absent → the oldest owned workspace
 * (the historical "default") stands in.
 */

/** The minimal identity we rely on downstream. */
export type CurrentUser = { id: string; name?: string | null; email?: string | null };

/** Cookie that pins the active workspace for a browser. A hint, never trusted blind. */
const ACTIVE_INSTANCE_COOKIE = "freedom.activeInstance";
const ACTIVE_INSTANCE_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
};

/**
 * The signed-in user, or throw. `cache` dedupes the `auth()` lookup within a
 * single request so callers can ask freely.
 */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  // Local-dev bypass (never in production — see `isAuthBypassed`): run as a fixed
  // local user so the whole DAL works without a Google sign-in.
  if (isAuthBypassed()) return getOrCreateDevUser();

  const session = await auth();
  const user = session?.user;
  if (!user?.id) throw new Error("Unauthorized");
  return { id: user.id, name: user.name, email: user.email };
});

/**
 * The signed-in user's default workspace, or `null` if they have none yet.
 * Read-only on purpose — provisioning happens lazily on first write
 * (`getOrCreateDefaultInstance`) so page renders never mutate.
 */
export const getDefaultInstance = cache(async () => {
  const user = await requireUser();
  const existing = await db.query.instances.findFirst({
    where: eq(instances.ownerId, user.id),
    orderBy: (i, { asc }) => [asc(i.createdAt)],
  });
  return existing ?? null;
});

/**
 * The signed-in user's default workspace, creating one on first use. Call this
 * only from write paths (server actions) — never during a render.
 */
export async function getOrCreateDefaultInstance() {
  const existing = await getDefaultInstance();
  if (existing) return existing;
  const user = await requireUser();
  const [created] = await db
    .insert(instances)
    .values({ name: "Personal", ownerId: user.id })
    .returning();
  return created;
}

/**
 * Ownership choke-point for when a client *does* name an instance: confirm it
 * exists and the signed-in user owns it before any read/write touches it.
 */
export async function requireInstance(instanceId: string) {
  const user = await requireUser();
  const instance = await db.query.instances.findFirst({
    where: eq(instances.id, instanceId),
  });
  if (!instance) throw new Error("Not found");
  if (instance.ownerId !== user.id) throw new Error("Forbidden");
  return instance;
}

/** Every workspace the signed-in user owns, oldest first (for the switcher). */
export const listOwnedInstances = cache(async () => {
  const user = await requireUser();
  return db.query.instances.findMany({
    where: eq(instances.ownerId, user.id),
    orderBy: (i, { asc }) => [asc(i.createdAt)],
  });
});

/**
 * The workspace to read this request. Honours the active-instance cookie as a
 * hint — re-verified through `requireInstance`, so a stale/tampered value falls
 * back to the default rather than reaching another owner's data. Read-only: never
 * provisions (page renders must not mutate).
 */
export const getActiveInstance = cache(async () => {
  const owned = await listOwnedInstances(); // already scoped to this owner
  const store = await cookies();
  const hinted = store.get(ACTIVE_INSTANCE_COOKIE)?.value;
  const id = resolveActiveInstanceId(hinted, owned);
  // Look the chosen id back up in the owned set — nothing outside it can leak.
  return owned.find((w) => w.id === id) ?? null;
});

/**
 * The active workspace for a write path, provisioning the default on first use.
 * Same cookie-as-hint discipline as `getActiveInstance`. Call only from server
 * actions — never during a render.
 */
export async function getOrCreateActiveInstance() {
  const owned = await listOwnedInstances();
  if (owned.length === 0) return getOrCreateDefaultInstance();
  const store = await cookies();
  const hinted = store.get(ACTIVE_INSTANCE_COOKIE)?.value;
  const id = resolveActiveInstanceId(hinted, owned);
  return owned.find((w) => w.id === id) ?? owned[0];
}

/** Create a new workspace owned by the signed-in user. */
export async function createInstance(name: string) {
  const user = await requireUser();
  const clean = name.trim() || "Workspace";
  const [created] = await db
    .insert(instances)
    .values({ name: clean, ownerId: user.id })
    .returning();
  return created;
}

/**
 * Point the browser's active-instance cookie at `instanceId` after confirming
 * the signed-in user owns it. Server-action / route context only (sets a cookie).
 */
export async function switchActiveInstance(instanceId: string) {
  await requireInstance(instanceId); // ownership choke-point before we trust the id
  const store = await cookies();
  store.set(ACTIVE_INSTANCE_COOKIE, instanceId, ACTIVE_INSTANCE_COOKIE_OPTS);
}

/** Create a workspace and immediately make it the active one. Action context only. */
export async function createAndActivateInstance(name: string) {
  const created = await createInstance(name);
  const store = await cookies();
  store.set(ACTIVE_INSTANCE_COOKIE, created.id, ACTIVE_INSTANCE_COOKIE_OPTS);
  return created;
}
