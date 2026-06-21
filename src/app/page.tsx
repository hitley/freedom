import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import FreedomApp from "@/components/FreedomApp";
import { loadFinancialProfile } from "@/lib/server/financial-profile";
import { loadVision } from "@/lib/server/vision";
import { loadBuckets } from "@/lib/server/buckets";
import { loadInvestments } from "@/lib/server/investments";
import {
  saveFinancialProfileAction,
  saveVisionAction,
  saveBucketsAction,
  saveInvestmentsAction,
} from "./actions";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  // Server-side load of each persisted domain (null → app uses its defaults/seed).
  const [initialInputs, initialVision, initialBuckets, initialInvestments] =
    await Promise.all([
      loadFinancialProfile(),
      loadVision(),
      loadBuckets(),
      loadInvestments(),
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
        saveInputsAction={saveFinancialProfileAction}
        saveVisionAction={saveVisionAction}
        saveBucketsAction={saveBucketsAction}
        saveInvestmentsAction={saveInvestmentsAction}
        signOutAction={signOutAction}
        userName={session.user.name ?? session.user.email ?? null}
      />
    </main>
  );
}
