"use client";

import { useState } from "react";
import { ACCOUNT_KINDS, type Account, type AccountKind } from "@/lib/buckets";

/**
 * Manage the real accounts money sits in (name, kind, balance). Buckets are
 * carved from these, so this is where the user keeps the underlying totals
 * honest. Renders as a modal overlay; `onSave` returns the full account list.
 */
export default function AccountsEditor({
  accounts,
  onSave,
  onCancel,
}: {
  accounts: Account[];
  onSave: (accounts: Account[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Account[]>(accounts);

  const update = (id: string, patch: Partial<Account>) =>
    setDraft((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const add = () =>
    setDraft((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", kind: "savings", balance: 0 },
    ]);

  const remove = (id: string) =>
    setDraft((prev) => prev.filter((a) => a.id !== id));

  const save = () =>
    onSave(
      draft
        .filter((a) => a.name.trim().length > 0)
        .map((a) => ({ ...a, name: a.name.trim() })),
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface p-6 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-bold">Accounts</h2>
        <p className="mt-1 text-sm text-muted">
          The real places your money sits. Buckets are carved from these.
        </p>

        <div className="mt-5 space-y-3">
          {draft.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-border bg-surface-2 p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  value={a.name}
                  onChange={(e) => update(a.id, { name: e.target.value })}
                  maxLength={80}
                  placeholder="Account name"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted/50 focus:border-emerald"
                />
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  aria-label="Remove account"
                  className="shrink-0 rounded-lg px-2 py-2 text-sm text-muted transition-colors hover:text-gold"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={a.kind}
                  onChange={(e) =>
                    update(a.id, { kind: e.target.value as AccountKind })
                  }
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-emerald"
                >
                  {ACCOUNT_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <div className="flex flex-1 items-center rounded-lg border border-border bg-surface px-3 transition-colors focus-within:border-emerald">
                  <span className="text-sm text-muted">£</span>
                  <input
                    inputMode="numeric"
                    value={a.balance ? String(a.balance) : ""}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                      update(a.id, { balance: Number.isFinite(n) ? n : 0 });
                    }}
                    placeholder="Balance"
                    className="w-full bg-transparent px-1.5 py-2 text-sm outline-none placeholder:text-muted/40"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={add}
          className="mt-3 w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted transition-colors hover:border-muted/50 hover:text-foreground"
        >
          + Add account
        </button>

        <div className="mt-7 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm text-muted transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-full bg-emerald px-6 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
