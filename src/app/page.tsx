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
      <FreedomApp
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
