import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

/**
 * Emails permitted to sign in, from `AUTH_ALLOWED_EMAILS` (comma-separated).
 * This keeps a private finance app private: anyone *can* attempt Google sign-in,
 * but only allowlisted addresses are admitted. If the env var is unset the list
 * is empty and the `signIn` callback falls open (dev convenience) — set it in any
 * shared/deployed environment.
 */
const allowedEmails = (process.env.AUTH_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Auth.js (self-hosted). Google is the only sign-in method; the identity record
 * is persisted in our own Postgres via the Drizzle adapter. Sessions are stored
 * in the database (not just a JWT) so they can be revoked.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    /**
     * Gate sign-in to the allowlist. Returning false aborts before any user or
     * session row is created, so non-allowlisted accounts never enter our DB.
     */
    signIn({ user }) {
      if (allowedEmails.length === 0) return true;
      const email = user.email?.toLowerCase();
      return !!email && allowedEmails.includes(email);
    },
  },
  pages: {
    signIn: "/signin",
  },
});
