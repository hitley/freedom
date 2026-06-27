# Deploying Freedom to Vercel

The production deployment runbook. `CLAUDE.md`'s **Getting started** covers a local
clone; this covers getting the app **live on Vercel** with real auth + a database.

- **Created:** 2026-06-27 (to be executed 2026-06-28)
- **Status:** not yet deployed — first deploy pending.

## Decisions already made

- **Deploy method: Vercel Git integration** — import the GitHub repo so Vercel
  auto-builds and redeploys on every push to `main` (vs. one-off CLI deploys).
- **Database: a new, separate production database** (a Neon branch named `production`,
  or a separate Neon project) — *not* the local-dev DB. Keeps dev data and prod data
  apart.

## ⚠️ The one gotcha that dictates ordering

`src/db/index.ts` **throws at module load if `DATABASE_URL` is unset**, and `src/auth.ts`
imports it. Next.js evaluates route handlers (incl. `/api/auth/[...nextauth]`) during
`next build`, so **a build with no `DATABASE_URL` fails at build time, not just runtime.**

➡️ **Set every environment variable in Vercel _before_ the first deploy.** Vercel includes
env vars in the build by default, so once they're set the build passes.

## Order of operations

Provision DB → migrate → set Vercel env → import & deploy → wire Google redirect → verify.

### 1. Create the production database — *Neon dashboard*

Create a new **branch** (e.g. `production`) in the existing Neon project, or a separate
project. Copy its **pooled** connection string (host contains `-pooler`, ends with
`?sslmode=require`). This is the value for `DATABASE_URL` in step 4.

### 2. Apply migrations to the prod DB — *terminal (one-off)*

A fresh DB has zero tables; create them before anyone signs in (sign-in writes to the
users table). From the repo root:

```sh
DATABASE_URL="<prod-pooled-connection-string>" npx drizzle-kit migrate
```

This applies every migration in `drizzle/` (auth tables + `instances` +
`financial_profiles` + the jsonb state tables + `inbox_item`).

> **Safe with `.env.local` present:** `drizzle.config.ts` calls
> `process.loadEnvFile(".env.local")`, but Node's `loadEnvFile` does **not** override an
> already-set env var — verified — so the inline `DATABASE_URL` above wins and targets
> prod, not local. Re-run this command after any future schema change (`drizzle-kit
> generate` then `migrate`).
>
> The connection string is a live credential — use it only for this command; don't commit
> it or paste it into tracked files.

### 3. Import the repo into Vercel — *Vercel dashboard*

- **Add New → Project → Import** `hitley/freedom`.
- Framework auto-detects **Next.js**. Leave the build command at the default `npm run
  build` (it builds the VitePress `/docs` site, then `next build`).
- **Do not click Deploy yet** — add env vars (step 4) first, or the first build fails (see
  the gotcha above).

### 4. Set environment variables in Vercel — *Vercel dashboard* (scope: Production)

| Key | Value |
|---|---|
| `DATABASE_URL` | the prod pooled string from step 1 |
| `AUTH_SECRET` | generate fresh: `npx auth secret` |
| `AUTH_GOOGLE_ID` | from the Google OAuth client (Web) |
| `AUTH_GOOGLE_SECRET` | from the Google OAuth client (Web) |
| `AUTH_ALLOWED_EMAILS` | **must set** — e.g. `hiteshbechar@googlemail.com` (+ family, comma-separated). An empty list **falls open** (anyone with a Google account gets in) |
| ~~`AUTH_DEV_BYPASS`~~ | **do not set** — it's hard-gated off when `NODE_ENV=production` regardless, but leave it out |

Then trigger the deploy.

### 5. Wire the Google OAuth redirect URI — *Google Cloud Console*

After the deploy you'll have a domain like `https://freedom-xxxx.vercel.app`. In the
existing OAuth client (APIs & Services → Credentials → the Web client), **add** an
authorized redirect URI (keep the localhost one):

```
https://<your-vercel-domain>/api/auth/callback/google
```

No redeploy needed — this change is Google-side. Reusing the existing OAuth client is
fine; just add the prod redirect URI alongside localhost.

### 6. Verify

Visit the domain → it should redirect to `/signin` → sign in with an **allowlisted**
Google account → you should land in the app. Add a row, reload, confirm it persisted
(round-trips through the prod DB).

## Checklist

- [ ] Prod Neon DB/branch created; pooled connection string in hand
- [ ] `npx drizzle-kit migrate` run against prod (step 2)
- [ ] Repo imported into Vercel (Next.js detected)
- [ ] All env vars set in Vercel **before** first deploy (`DATABASE_URL`, `AUTH_SECRET`,
      `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_ALLOWED_EMAILS`)
- [ ] First deploy succeeded
- [ ] Prod redirect URI added in Google Cloud
- [ ] Signed in with an allowlisted account; data persists across reload

## Notes & follow-ups

- **Custom domain:** Auth.js v5 auto-detects the host on Vercel, so no `AUTH_URL` is needed
  on the default `.vercel.app` domain. If you add a **custom domain** later, set `AUTH_URL`
  to it (Production scope) **and** add its `/api/auth/callback/google` redirect URI in
  Google.
- **Preview deployments:** if you want PR/preview builds to work, also set the env vars for
  the **Preview** scope (preview URLs are dynamic; database-session auth on previews needs
  thought — simplest is to treat previews as build-only and test auth on Production).
- **Migrations are manual** for now (not run during the Vercel build). After any schema
  change: `npx drizzle-kit generate` then run the step-2 command against prod. Automating
  this (a deploy hook) is a future improvement.
- **Security hardening still pending** before sharing with anyone beyond yourself — see the
  Security sections in `CLAUDE.md` / `ROADMAP.md` (field-level encryption of monetary
  figures, security headers/CSP, audit trail).
