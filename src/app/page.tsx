import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import FreedomApp from "@/components/FreedomApp";
import { loadFinancialProfile } from "@/lib/server/financial-profile";
import { loadVision } from "@/lib/server/vision";
import { loadBuckets } from "@/lib/server/buckets";
import { loadInvestments } from "@/lib/server/investments";
import { loadSpending } from "@/lib/server/spending";
import { listInbox } from "@/lib/server/inbox";
import { getActiveInstance, listOwnedInstances } from "@/lib/server/instance";
import { DEV_USER_NAME, isAuthBypassed } from "@/lib/server/dev-auth";
import {
  saveFinancialProfileAction,
  saveVisionAction,
  saveBucketsAction,
  saveInvestmentsAction,
  saveSpendingAction,
  addInboxItemAction,
  dismissInboxItemAction,
  processInboxItemAction,
  reconcileInboxItemAction,
  switchWorkspaceAction,
  createWorkspaceAction,
} from "./actions";

export default async function Home() {
  const bypass = isAuthBypassed();
  const session = bypass ? null : await auth();
  if (!bypass && !session?.user) redirect("/signin");

  // Server-side load of each persisted Component (null → app uses its defaults/seed).
  const [
    initialInputs,
    initialVision,
    initialBuckets,
    initialInvestments,
    initialSpending,
    initialInbox,
    workspaces,
    activeInstance,
  ] = await Promise.all([
    loadFinancialProfile(),
    loadVision(),
    loadBuckets(),
    loadInvestments(),
    loadSpending(),
    listInbox(),
    listOwnedInstances(),
    getActiveInstance(),
  ]);

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <main className="flex-1">
      {/*
        Keying on the active workspace forces a full remount when it changes.
        FreedomApp seeds all its state from the initial* props once at mount and
        never re-syncs, so without this the client keeps showing (and debounced-
        saving) the previous workspace's data after a switch — silently writing
        one workspace's figures into another. The key ties client state lifetime
        to the workspace it was loaded for.
      */}
      <FreedomApp
        key={activeInstance?.id ?? "no-instance"}
        initialInputs={initialInputs}
        initialVision={initialVision}
        initialBuckets={initialBuckets}
        initialInvestments={initialInvestments}
        initialSpending={initialSpending}
        initialInbox={initialInbox}
        saveInputsAction={saveFinancialProfileAction}
        saveVisionAction={saveVisionAction}
        saveBucketsAction={saveBucketsAction}
        saveInvestmentsAction={saveInvestmentsAction}
        saveSpendingAction={saveSpendingAction}
        addInboxItemAction={addInboxItemAction}
        dismissInboxItemAction={dismissInboxItemAction}
        processInboxItemAction={processInboxItemAction}
        reconcileInboxItemAction={reconcileInboxItemAction}
        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
        activeInstanceId={activeInstance?.id ?? null}
        switchWorkspaceAction={switchWorkspaceAction}
        createWorkspaceAction={createWorkspaceAction}
        signOutAction={signOutAction}
        authBypassed={bypass}
        userName={
          bypass
            ? DEV_USER_NAME
            : (session?.user?.name ?? session?.user?.email ?? null)
        }
      />
    </main>
  );
}
