import { describe, expect, it } from "vitest";
import {
  distributeFunding,
  fundingAccountId,
  simulate,
  parseISO,
  type Account,
  type Bucket,
  type BucketsState,
} from "./index";

/* ---- fixtures ------------------------------------------------------------- */

const acct = (id: string, balance: number, extra: Partial<Account> = {}): Account => ({
  id,
  name: id,
  kind: "current",
  balance,
  ...extra,
});

const bucket = (id: string, b: Partial<Bucket> = {}): Bucket => ({
  id,
  name: id,
  glyph: "🪣",
  allocations: [],
  cashflows: [],
  ...b,
});

const fb = (id: string, balance: number, target?: number, targetDate?: string) => ({
  id,
  balance,
  target,
  targetDate,
});

/* ---- distributeFunding ---------------------------------------------------- */

describe("distributeFunding — priority (waterfall)", () => {
  const asOf = parseISO("2026-01-01");

  it("fills buckets in order, capping each at its target and overflowing", () => {
    const give = distributeFunding(150, [fb("a", 0, 100), fb("b", 0, 100)], "priority", asOf);
    expect(give.a).toBe(100);
    expect(give.b).toBe(50);
  });

  it("lets a no-target bucket absorb whatever's left", () => {
    const give = distributeFunding(150, [fb("a", 0, 100), fb("c", 0)], "priority", asOf);
    expect(give.a).toBe(100);
    expect(give.c).toBe(50);
  });
});

describe("distributeFunding — even split", () => {
  const asOf = parseISO("2026-01-01");

  it("splits equally, then redistributes a capped bucket's leftover to the rest", () => {
    // 150 across A (cap 40) and B (cap 1000): A takes 40, B takes the remaining 110.
    const give = distributeFunding(150, [fb("a", 0, 40), fb("b", 0, 1000)], "even", asOf);
    expect(give.a).toBe(40);
    expect(give.b).toBeCloseTo(110, 6);
  });
});

describe("distributeFunding — target-date", () => {
  const asOf = parseISO("2026-01-01");

  it("gives each dated bucket remaining ÷ months-left", () => {
    // A: 90 remaining over 5 months → 18; B: 100 remaining over 2 months → 50.
    const give = distributeFunding(
      68,
      [fb("a", 10, 100, "2026-06-01"), fb("b", 0, 100, "2026-03-01")],
      "target-date",
      asOf,
    );
    expect(give.a).toBeCloseTo(18, 6);
    expect(give.b).toBeCloseTo(50, 6);
  });

  it("funds an overdue bucket's full remaining immediately", () => {
    const give = distributeFunding(500, [fb("a", 0, 200, "2025-06-01")], "target-date", asOf);
    expect(give.a).toBe(200);
  });
});

/* ---- fundingAccountId ------------------------------------------------------ */

describe("fundingAccountId", () => {
  it("prefers the explicit source, else the largest-allocation account", () => {
    expect(fundingAccountId(bucket("x", { sourceAccountId: "cur" }))).toBe("cur");
    expect(
      fundingAccountId(
        bucket("y", { allocations: [{ accountId: "a", amount: 10 }, { accountId: "b", amount: 99 }] }),
      ),
    ).toBe("b");
  });
});

/* ---- simulate: account flows ---------------------------------------------- */

describe("simulate — account flows", () => {
  it("raises an account's balance as a recurring inflow lands", () => {
    const from = parseISO("2026-01-01");
    const to = parseISO("2026-04-01");
    const state: BucketsState = {
      accounts: [
        acct("cur", 0, {
          flows: [
            {
              id: "sal",
              label: "Salary",
              kind: "in",
              amount: 1000,
              recurrence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: 1 },
            },
          ],
        }),
      ],
      buckets: [],
    };
    const tl = simulate(state, from, to);
    const series = tl.accounts.cur;
    const end = series[series.length - 1];
    // Window is end-exclusive → Jan/Feb/Mar paydays (3 × 1000), all unallocated (no buckets).
    expect(end.balance).toBe(3000);
    expect(end.unallocated).toBe(3000);
  });
});

/* ---- simulate: funding sweeps --------------------------------------------- */

describe("simulate — funding sweep", () => {
  const from = parseISO("2026-01-01");

  it("fixed amount sweeps unallocated into a bucket, capped at its target", () => {
    const state: BucketsState = {
      accounts: [
        acct("cur", 1000, {
          funding: {
            strategy: "priority",
            cadence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: 1 },
            amount: 300,
          },
        }),
      ],
      buckets: [bucket("goal", { target: 500, sourceAccountId: "cur" })],
    };
    const tl = simulate(state, from, parseISO("2026-04-01"));
    const goal = tl.buckets.goal;
    // Monotonic up, and it stops at the 500 target rather than overshooting.
    expect(Math.max(...goal)).toBe(500);
    expect(goal[goal.length - 1]).toBe(500);
    // The account keeps its balance; the swept money is now allocated, not free.
    const acc = tl.accounts.cur[tl.accounts.cur.length - 1];
    expect(acc.balance).toBe(1000);
    expect(acc.unallocated).toBe(500);
  });

  it("surplus mode sweeps the whole unallocated balance (capped per bucket)", () => {
    const state: BucketsState = {
      accounts: [
        acct("cur", 1000, {
          funding: {
            strategy: "priority",
            cadence: { freq: "monthly", startDate: "2026-01-01", dayOfMonth: 1 },
            // no amount → sweep the computed surplus (all unallocated)
          },
        }),
      ],
      buckets: [bucket("goal", { target: 400, sourceAccountId: "cur" })],
    };
    const tl = simulate(state, from, parseISO("2026-02-01"));
    const goal = tl.buckets.goal;
    // First sweep offers all 1000 unallocated; the bucket takes only its 400 remaining.
    expect(goal[goal.length - 1]).toBe(400);
  });

  it("leaves accounts without a plan or flows exactly as before", () => {
    const state: BucketsState = {
      accounts: [acct("cur", 1000)],
      buckets: [bucket("b", { allocations: [{ accountId: "cur", amount: 200 }] })],
    };
    const tl = simulate(state, from, parseISO("2026-03-01"));
    expect(tl.buckets.b.every((v) => v === 200)).toBe(true);
    expect(tl.accounts.cur.every((a) => a.balance === 1000 && a.unallocated === 800)).toBe(true);
  });
});
