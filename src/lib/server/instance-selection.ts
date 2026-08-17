/**
 * The pure workspace-selection rule, deliberately lifted out of the cookie/DB
 * plumbing in `instance.ts` so the security-critical decision is unit-testable
 * with no infra. An owner can hold several workspaces (their own + a child's,
 * say); the active-instance cookie remembers the last one they switched to — but
 * it is only ever a *hint*. It decides the active workspace **only** when it still
 * names a workspace the owner actually holds; a stale id, or one belonging to
 * someone else, falls back to the default (the oldest owned workspace). That
 * fallback is what stops a tampered cookie from ever reaching another owner's data.
 *
 * `instance.ts` feeds this the owner's own workspaces (already filtered to
 * `ownerId` by the query) plus the raw cookie value, and looks the chosen id back
 * up in that same list — so nothing outside the owned set can be returned.
 */
export function resolveActiveInstanceId(
  hintedId: string | null | undefined,
  ownedOldestFirst: { id: string }[],
): string | null {
  if (hintedId && ownedOldestFirst.some((w) => w.id === hintedId)) return hintedId;
  return ownedOldestFirst[0]?.id ?? null;
}
