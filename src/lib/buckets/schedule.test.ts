import { describe, expect, it } from "vitest";
import { occurrences, parseISO, toISO } from "./schedule";
import type { Recurrence } from "./types";

/** Expand a recurrence over a wide window and return the fired dates as ISO strings. */
const fire = (rec: Recurrence, from = "2026-01-01", to = "2027-12-31") =>
  occurrences(rec, parseISO(from), parseISO(to)).map(toISO);

describe("occurrences — fortnightly (weekly × 2)", () => {
  it("steps every 14 days from the start date", () => {
    const dates = fire(
      { freq: "weekly", startDate: "2026-01-05", interval: 2 },
      "2026-01-01",
      "2026-02-15",
    );
    expect(dates).toEqual(["2026-01-05", "2026-01-19", "2026-02-02"]);
  });
});

describe("occurrences — count cap", () => {
  it("stops after `count` fortnightly occurrences regardless of the window", () => {
    const dates = fire({
      freq: "weekly",
      startDate: "2026-01-05",
      interval: 2,
      count: 3,
    });
    expect(dates).toEqual(["2026-01-05", "2026-01-19", "2026-02-02"]);
  });

  it("caps monthly occurrences at `count`, counting from the start", () => {
    const dates = fire({
      freq: "monthly",
      startDate: "2026-01-20",
      dayOfMonth: 20,
      count: 4,
    });
    expect(dates).toEqual([
      "2026-01-20",
      "2026-02-20",
      "2026-03-20",
      "2026-04-20",
    ]);
  });

  it("still honours the query window while capping by count", () => {
    // 5 fortnightly buys from Jan 5; ask only about a mid-range window.
    const dates = fire(
      { freq: "weekly", startDate: "2026-01-05", interval: 2, count: 5 },
      "2026-01-15",
      "2026-12-31",
    );
    // First (Jan 5) is before the window; last allowed is the 5th (Mar 2).
    expect(dates).toEqual(["2026-01-19", "2026-02-02", "2026-02-16", "2026-03-02"]);
  });
});
