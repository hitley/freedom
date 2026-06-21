import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import FreedomApp from "@/components/FreedomApp";
import { loadFinancialProfile } from "@/lib/server/financial-profile";
import { saveFinancialProfileAction } from "./actions";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  // Server-side load of the persisted engine inputs (null → app uses defaults).
  const initialInputs = await loadFinancialProfile();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <main className="flex-1">
      <FreedomApp
        initialInputs={initialInputs}
        saveInputsAction={saveFinancialProfileAction}
        signOutAction={signOutAction}
        userName={session.user.name ?? session.user.email ?? null}
      />
    </main>
  );
}
