import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { instances } from "@/db/schema";
import { getOrCreateDevUser, isAuthBypassed } from "./dev-auth";

/**
 * Server-side access layer for instances (workspaces). Every read/write of user
 * data starts here so authorization lives in one place — never trust a client to
 * name an instance it doesn't own.
 */

/** The minimal identity we rely on downstream. */
export type CurrentUser = { id: string; name?: string | null; email?: string | null };

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
