import "server-only";

import { db } from "@/db";
import { users } from "@/db/schema";
import type { CurrentUser } from "./instance";

/**
 * Local-development auth bypass.
 *
 * Signing in with Google is required by default in **every** environment. For
 * local testing that round-trip is friction, so it can be switched off by setting
 * `AUTH_DEV_BYPASS=true` in `.env.local`: the app then runs as a fixed local user
 * with no sign-in.
 *
 * Two hard safety rules, both enforced here so there's no way around them:
 *  1. **Off unless explicitly opted in.** The flag must be the literal `"true"`;
 *     anything else (including unset) keeps real auth on.
 *  2. **Never in production.** Even with the flag set, `NODE_ENV === "production"`
 *     refuses the bypass. This app holds private financial data; disabling auth on
 *     a deployed instance must be impossible, not merely discouraged.
 */
export function isAuthBypassed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.AUTH_DEV_BYPASS === "true";
}

/**
 * The stand-in identity used while the bypass is active. Fixed id/email so the
 * same workspace and data are reused across restarts. Not a secret — it only ever
 * resolves in non-production with the flag explicitly set.
 */
// `satisfies` keeps the fields as concrete non-null strings (so the insert below
// type-checks against the users table) while still proving it's a valid CurrentUser.
const DEV_USER = {
  id: "dev-local-user",
  name: "Local Dev",
  email: "dev@localhost",
} satisfies CurrentUser;

/** Display name for the dev user, for the header without a DB round-trip. */
export const DEV_USER_NAME = DEV_USER.name;

/**
 * Ensure the dev user row exists (instances FK to `users.id`) and return its
 * identity. Idempotent — `onConflictDoNothing` makes it safe to call on every
 * request, including during render. Only ever invoked when `isAuthBypassed()`.
 */
export async function getOrCreateDevUser(): Promise<CurrentUser> {
  await db
    .insert(users)
    .values({ id: DEV_USER.id, name: DEV_USER.name, email: DEV_USER.email })
    .onConflictDoNothing({ target: users.id });
  return DEV_USER;
}
