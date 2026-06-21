import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

/**
 * Sign-in gate. Google is the only method; identity is stored in our own DB via
 * the Drizzle adapter. If already signed in, bounce straight to the app.
 */
export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center">
        <div className="font-display text-2xl font-bold tracking-tight">
          freedom<span className="text-emerald">.</span>
        </div>
        <p className="mt-2 text-sm text-muted">
          Define and track the three dimensions of your freedom.
        </p>

        <form
          className="mt-8"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-surface transition-opacity hover:opacity-90"
          >
            Continue with Google
          </button>
        </form>

        <p className="mt-6 text-xs text-muted/70">
          Your data is private to you, stored in our own database.
        </p>
      </div>
    </main>
  );
}
