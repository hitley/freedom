import { describe, expect, it } from "vitest";
import {
  countByStatus,
  isActive,
  needsReview,
  newInboxItemSchema,
  sortByNewest,
  type InboxItem,
  type InboxStatus,
} from "./index";

function item(partial: Partial<InboxItem> & Pick<InboxItem, "id">): InboxItem {
  return {
    instanceId: "inst",
    source: "csv",
    label: "statement.csv",
    raw: "date,amount\n2026-01-01,10",
    status: "pending",
    extracted: null,
    error: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    processedAt: null,
    ...partial,
  };
}

describe("isActive / needsReview", () => {
  it("treats applied and dismissed as inactive, the rest as active", () => {
    expect(isActive(item({ id: "a", status: "pending" }))).toBe(true);
    expect(isActive(item({ id: "b", status: "proposed" }))).toBe(true);
    expect(isActive(item({ id: "c", status: "applied" }))).toBe(false);
    expect(isActive(item({ id: "d", status: "dismissed" }))).toBe(false);
  });

  it("flags only proposed items as needing review", () => {
    expect(needsReview(item({ id: "a", status: "proposed" }))).toBe(true);
    expect(needsReview(item({ id: "b", status: "pending" }))).toBe(false);
  });
});

describe("sortByNewest", () => {
  it("orders by capture time, newest first", () => {
    const older = item({ id: "old", createdAt: new Date("2026-01-01") });
    const newer = item({ id: "new", createdAt: new Date("2026-03-01") });
    expect(sortByNewest([older, newer]).map((i) => i.id)).toEqual(["new", "old"]);
  });
});

describe("countByStatus", () => {
  it("tallies every status, zero-filling the absent ones", () => {
    const counts = countByStatus([
      item({ id: "a", status: "pending" }),
      item({ id: "b", status: "pending" }),
      item({ id: "c", status: "proposed" }),
    ]);
    expect(counts.pending).toBe(2);
    expect(counts.proposed).toBe(1);
    expect(counts.applied).toBe(0);
    expect(counts.failed satisfies number).toBe(0);
  });
});

describe("newInboxItemSchema", () => {
  it("accepts a csv/text capture and trims", () => {
    const parsed = newInboxItemSchema.parse({
      source: "csv",
      label: "  May statement  ",
      raw: "  date,amount\n2026-05-01,10  ",
    });
    expect(parsed.label).toBe("May statement");
  });

  it("rejects empty raw, an over-long label, and an unsupported source", () => {
    expect(() => newInboxItemSchema.parse({ source: "csv", label: "x", raw: "" })).toThrow();
    expect(() =>
      newInboxItemSchema.parse({ source: "csv", label: "x".repeat(200), raw: "data" }),
    ).toThrow();
    // pdf is a known source but not yet capturable.
    expect(() =>
      newInboxItemSchema.parse({ source: "pdf" as InboxStatus, label: "x", raw: "data" }),
    ).toThrow();
  });
});
