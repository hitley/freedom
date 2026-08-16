// Seed the DEMO local database with fabricated-but-realistic data.
//
// This is the dataset you switch to when demoing Freedom to someone else, so your
// real numbers never appear on screen. Everything here is invented — a plausible
// fake household, not anyone's actual finances — which is why it's safe to commit.
//
// It opens the PGlite data dir named by PGLITE_DATA_DIR (never the default) and
// rewrites the dev user's workspace from scratch: it wipes that owner's instances
// (cascading to every Component's rows) and inserts a fresh, complete demo. Idempotent
// — re-run any time for a clean slate.
//
//   npm run seed:demo          # migrate the demo db (if needed) + seed it
//   npm run dev:demo           # run the app against the seeded demo db
//
// Safety: it refuses to run unless PGLITE_DATA_DIR is set explicitly, so it can
// never wipe the default ./.pglite or, more importantly, your real profile.

import { PGlite } from "@electric-sql/pglite";
import path from "node:path";

const dataDir = process.env.PGLITE_DATA_DIR;
if (!dataDir) {
  console.error(
    "✗ Refusing to seed: PGLITE_DATA_DIR is not set.\n" +
      "  Run via `npm run seed:demo` (which points it at ./.pglite-demo), or set it\n" +
      "  explicitly. This guard makes it impossible to seed the default or real db.",
  );
  process.exit(1);
}

// The fixed local identity the app runs as under AUTH_DEV_BYPASS (see
// src/lib/server/dev-auth.ts). Seeding this user's workspace is what the dev:demo
// server then reads.
const USER_ID = "dev-local-user";
const USER_NAME = "Local Dev";
const USER_EMAIL = "dev@localhost";

const instanceId = crypto.randomUUID();
const inboxImportId = crypto.randomUUID();

/* -------------------------------------------------------------------------- */
/* The fabricated household — the Rivers, chasing a Med sailing life.          */
/* -------------------------------------------------------------------------- */

const vision = {
  headline: "Sail the Med with the family",
  why: "Freedom means unhurried mornings, summers on the water with the kids while they still want to come, and work that's a choice rather than an obligation. The number isn't about being rich — it's about buying back time before it's gone.",
  motivations: ["family", "travel", "time"],
  fireStyle: "full",
  annualSpend: 42000,
  targetAge: 55,
};

const financialProfile = {
  currentInvested: 285000,
  monthlyContribution: 2500,
  annualSpend: 42000,
  realReturnPct: 5,
  withdrawalRatePct: 4,
  ongoingAnnualIncome: 6000,
  currentAge: 38,
};

const buckets = {
  accounts: [
    { id: "acc-offset", name: "Mortgage offset", kind: "offset", balance: 68000 },
    { id: "acc-savings", name: "Emergency savings", kind: "savings", balance: 15000 },
    { id: "acc-current", name: "Everyday current", kind: "current", balance: 4200 },
  ],
  buckets: [
    {
      id: "b-emergency",
      name: "Emergency fund",
      glyph: "🛟",
      target: 18000,
      allocations: [{ accountId: "acc-savings", amount: 15000 }],
      cashflows: [
        {
          id: "cf-emergency-topup",
          label: "Monthly top-up",
          kind: "in",
          amount: 250,
          recurrence: { freq: "monthly", startDate: "2026-01-05", dayOfMonth: 5 },
        },
      ],
    },
    {
      id: "b-holiday",
      name: "Med sailing trip",
      glyph: "⛵",
      target: 6000,
      targetDate: "2027-07-01",
      allocations: [{ accountId: "acc-offset", amount: 2500 }],
      cashflows: [
        {
          id: "cf-holiday-saver",
          label: "Holiday saver",
          kind: "in",
          amount: 300,
          recurrence: { freq: "monthly", startDate: "2026-02-01", dayOfMonth: 1 },
        },
        {
          id: "cf-holiday-spend",
          label: "Charter the boat",
          kind: "out",
          amount: 0,
          drain: true,
          recurrence: { freq: "once", startDate: "2027-07-01" },
        },
      ],
    },
    {
      id: "b-home",
      name: "Home & renovations",
      glyph: "🏠",
      allocations: [{ accountId: "acc-offset", amount: 40000 }],
      cashflows: [],
    },
  ],
};

const investments = {
  holdings: [
    {
      id: "h-super",
      name: "Aviva Workplace Pension",
      kind: "super",
      valuation: "balance",
      balance: 132000,
      expectedReturnPct: 5,
      contribution: {
        amount: 900,
        recurrence: { freq: "monthly", startDate: "2026-01-28", dayOfMonth: 28 },
      },
      history: [
        { date: "2024-06-30", value: 104000 },
        { date: "2025-06-30", value: 118500, contributed: 10800 },
        { date: "2026-06-30", value: 132000, contributed: 10800 },
      ],
    },
    {
      id: "h-vwrl",
      name: "Vanguard FTSE All-World",
      kind: "etf",
      valuation: "market",
      ticker: "VWRL",
      units: 820,
      pricePerUnit: 96.4,
      expectedReturnPct: 6,
      contribution: {
        amount: 600,
        recurrence: { freq: "monthly", startDate: "2026-01-15", dayOfMonth: 15 },
      },
      drp: { annualYieldPct: 2, frequency: "quarterly" },
      history: [
        { date: "2025-06-30", value: 70000, contributed: 6000 },
        { date: "2026-06-30", value: 79048, contributed: 7200 },
      ],
    },
    {
      id: "h-lgen",
      name: "Legal & General",
      kind: "shares",
      valuation: "market",
      ticker: "LGEN",
      units: 1500,
      pricePerUnit: 2.35,
      expectedReturnPct: 4,
      drp: { annualYieldPct: 8, frequency: "semiannual" },
    },
    {
      id: "h-cash-isa",
      name: "Cash ISA",
      kind: "cash",
      valuation: "balance",
      balance: 12000,
      expectedReturnPct: 4,
    },
  ],
};

const spending = {
  transactions: [
    {
      id: "t-salary-jul",
      date: "2026-07-25",
      description: "ACME LTD SALARY",
      amount: 3800,
      direction: "in",
      category: "income",
      source: { kind: "manual" },
    },
    {
      id: "t-mortgage-jul",
      date: "2026-07-01",
      description: "NATIONWIDE MORTGAGE DD",
      amount: 1150,
      direction: "out",
      category: "housing",
      source: { kind: "manual" },
      recurring: { expenseId: "re-mortgage", dueDate: "2026-07-01" },
    },
    {
      id: "t-groceries-1",
      date: "2026-07-06",
      description: "TESCO STORES 2841",
      amount: 82.4,
      direction: "out",
      category: "groceries",
      source: { kind: "import", inboxItemId: inboxImportId },
    },
    {
      id: "t-groceries-2",
      date: "2026-07-19",
      description: "SAINSBURYS S/MKT",
      amount: 74.15,
      direction: "out",
      category: "groceries",
      source: { kind: "import", inboxItemId: inboxImportId },
    },
    {
      id: "t-dining-1",
      date: "2026-07-12",
      description: "THE ANCHOR INN",
      amount: 58.0,
      direction: "out",
      category: "dining",
      source: { kind: "import", inboxItemId: inboxImportId },
    },
    {
      id: "t-transport-1",
      date: "2026-07-08",
      description: "TRAINLINE",
      amount: 41.2,
      direction: "out",
      category: "transport",
      source: { kind: "import", inboxItemId: inboxImportId },
    },
    {
      id: "t-utilities-1",
      date: "2026-07-15",
      description: "OCTOPUS ENERGY",
      amount: 138.0,
      direction: "out",
      category: "utilities",
      source: { kind: "manual" },
    },
    {
      id: "t-subs-1",
      date: "2026-07-03",
      description: "NETFLIX.COM",
      amount: 12.99,
      direction: "out",
      category: "subscriptions",
      source: { kind: "manual" },
    },
    {
      id: "t-transfer-1",
      date: "2026-07-02",
      description: "TRANSFER TO SAVINGS",
      amount: 250,
      direction: "out",
      category: "transfer",
      source: { kind: "manual" },
    },
    {
      id: "t-shopping-1",
      date: "2026-06-28",
      description: "JOHN LEWIS",
      amount: 119.5,
      direction: "out",
      category: "shopping",
      source: { kind: "import", inboxItemId: inboxImportId },
    },
    {
      id: "t-salary-jun",
      date: "2026-06-25",
      description: "ACME LTD SALARY",
      amount: 3800,
      direction: "in",
      category: "income",
      source: { kind: "manual" },
    },
    {
      id: "t-groceries-jun",
      date: "2026-06-14",
      description: "ALDI 118",
      amount: 63.75,
      direction: "out",
      category: "groceries",
      source: { kind: "manual" },
    },
  ],
  recurring: [
    {
      id: "re-mortgage",
      payee: "Nationwide (mortgage)",
      category: "housing",
      direction: "out",
      estimate: 1150,
      basis: "fixed",
      recurrence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: 1 },
      match: { descriptions: ["NATIONWIDE MORTGAGE"] },
      active: true,
    },
    {
      id: "re-council-tax",
      payee: "Council tax",
      category: "utilities",
      direction: "out",
      estimate: 195,
      basis: "fixed",
      recurrence: { freq: "monthly", startDate: "2026-01-05", dayOfMonth: 5 },
      active: true,
    },
    {
      id: "re-energy",
      payee: "Octopus Energy",
      category: "utilities",
      direction: "out",
      estimate: 140,
      basis: "estimated",
      recurrence: { freq: "monthly", startDate: "2026-01-15", dayOfMonth: 15 },
      match: { descriptions: ["OCTOPUS ENERGY"] },
      active: true,
      notes: "Averaged over the year; higher in winter.",
    },
    {
      id: "re-netflix",
      payee: "Netflix",
      category: "subscriptions",
      direction: "out",
      estimate: 12.99,
      basis: "fixed",
      recurrence: { freq: "monthly", startDate: "2026-01-03", dayOfMonth: 3 },
      active: true,
    },
    {
      id: "re-car-service",
      payee: "Audi servicing",
      category: "transport",
      direction: "out",
      estimate: 480,
      basis: "estimated",
      recurrence: { freq: "monthly", startDate: "2026-09-20", dayOfMonth: 20, interval: 12 },
      active: true,
      notes: "Annual service, roughly every September.",
    },
  ],
};

// A processed inbox artifact — the provenance the imported transactions point back
// to — plus a still-pending drop, so the ingestion pipeline shows both states.
const inboxItems = [
  {
    id: inboxImportId,
    source: "csv",
    label: "current-account-jul.csv",
    raw: "Date,Description,Amount\n2026-07-06,TESCO STORES 2841,-82.40\n2026-07-08,TRAINLINE,-41.20\n2026-07-12,THE ANCHOR INN,-58.00\n2026-07-19,SAINSBURYS S/MKT,-74.15\n2026-06-28,JOHN LEWIS,-119.50\n",
    status: "processed",
    extracted: { count: 5 },
    processedAt: new Date("2026-07-20T09:12:00Z"),
  },
  {
    id: crypto.randomUUID(),
    source: "paste",
    label: "Amex statement (pasted)",
    raw: "16 Jul  AMZN Mktp UK  £34.99\n18 Jul  Pret A Manger  £6.40\n",
    status: "pending",
    extracted: null,
    processedAt: null,
  },
];

/* -------------------------------------------------------------------------- */

const client = new PGlite(dataDir);

async function run() {
  // Ensure the dev user exists (instances FK to it), then wipe just this owner's
  // workspace — cascades remove every Component's rows — and rebuild it.
  await client.query(
    `INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
    [USER_ID, USER_NAME, USER_EMAIL],
  );
  await client.query(`DELETE FROM instance WHERE owner_id = $1`, [USER_ID]);

  await client.query(
    `INSERT INTO instance (id, name, owner_id) VALUES ($1, $2, $3)`,
    [instanceId, "Demo Household", USER_ID],
  );

  await client.query(
    `INSERT INTO financial_profile
       (instance_id, current_invested, monthly_contribution, annual_spend,
        real_return_pct, withdrawal_rate_pct, ongoing_annual_income, current_age)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      instanceId,
      financialProfile.currentInvested,
      financialProfile.monthlyContribution,
      financialProfile.annualSpend,
      financialProfile.realReturnPct,
      financialProfile.withdrawalRatePct,
      financialProfile.ongoingAnnualIncome,
      financialProfile.currentAge,
    ],
  );

  for (const [table, doc] of [
    ["vision_state", vision],
    ["buckets_state", buckets],
    ["investments_state", investments],
    ["spending_state", spending],
  ]) {
    await client.query(
      `INSERT INTO ${table} (instance_id, data) VALUES ($1, $2::jsonb)`,
      [instanceId, JSON.stringify(doc)],
    );
  }

  for (const item of inboxItems) {
    await client.query(
      `INSERT INTO inbox_item
         (id, instance_id, source, label, raw, status, extracted, processed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        item.id,
        instanceId,
        item.source,
        item.label,
        item.raw,
        item.status,
        item.extracted === null ? null : JSON.stringify(item.extracted),
        item.processedAt,
      ],
    );
  }
}

await run();
await client.close();

console.log(
  `✓ Seeded demo workspace "Demo Household" into PGlite at ${path.resolve(dataDir)}\n` +
    `  ${buckets.buckets.length} buckets · ${investments.holdings.length} holdings · ` +
    `${spending.transactions.length} transactions · ${inboxItems.length} inbox items`,
);
