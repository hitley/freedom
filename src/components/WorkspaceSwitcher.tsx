"use client";

import { useState, useTransition } from "react";

type Workspace = { id: string; name: string };

/**
 * Header control for switching between the workspaces an owner holds (their own,
 * a child's, …) and creating a new one. Both actions are server actions that
 * re-verify ownership and `revalidatePath` the page, so the whole app re-renders
 * against the newly-active instance — this component only reflects state, it
 * never trusts the client with another instance's data.
 */
export default function WorkspaceSwitcher({
  workspaces,
  activeInstanceId,
  switchWorkspaceAction,
  createWorkspaceAction,
}: {
  workspaces: Workspace[];
  activeInstanceId: string | null;
  switchWorkspaceAction: (instanceId: string) => Promise<{ ok: true }>;
  createWorkspaceAction: (name: string) => Promise<{ ok: true }>;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const active =
    workspaces.find((w) => w.id === activeInstanceId) ?? workspaces[0] ?? null;

  // Nothing to switch between and none created yet — stay out of the way until
  // there's a real choice to make (the default workspace is provisioned on first save).
  if (workspaces.length <= 1 && !active) return null;

  function switchTo(id: string) {
    if (id === active?.id) return setOpen(false);
    startTransition(async () => {
      await switchWorkspaceAction(id);
      setOpen(false);
    });
  }

  function create() {
    const clean = name.trim();
    if (!clean) return;
    startTransition(async () => {
      await createWorkspaceAction(clean);
      setName("");
      setCreating(false);
      setOpen(false);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="workspace-switcher"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 transition-colors hover:text-foreground disabled:opacity-60"
      >
        <span className="text-muted/70">Workspace</span>
        <span className="text-foreground">{active?.name ?? "Personal"}</span>
        <span className="text-muted/50">▾</span>
      </button>

      {open && (
        <>
          {/* click-off backdrop */}
          <button
            type="button"
            aria-label="Close workspace menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            data-testid="workspace-menu"
            className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-border bg-surface p-1 shadow-xl"
          >
            {workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => switchTo(w.id)}
                disabled={pending}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-60 ${
                  w.id === active?.id ? "text-foreground" : "text-muted"
                }`}
              >
                <span className="truncate">{w.name}</span>
                {w.id === active?.id && <span className="text-emerald">✓</span>}
              </button>
            ))}

            <div className="my-1 border-t border-border" />

            {creating ? (
              <div className="flex items-center gap-1 p-1">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                    if (e.key === "Escape") setCreating(false);
                  }}
                  placeholder="e.g. Arlo"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm text-foreground outline-none focus:border-emerald/60"
                />
                <button
                  type="button"
                  onClick={create}
                  disabled={pending || !name.trim()}
                  className="rounded-lg bg-emerald/15 px-2 py-1 text-sm text-emerald transition-colors hover:bg-emerald/25 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <span className="text-emerald">＋</span> New workspace
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
