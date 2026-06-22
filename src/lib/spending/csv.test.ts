import { describe, expect, it } from "vitest";
import {
  detectColumns,
  parseAmount,
  parseCsvRows,
  parseDate,
  parseStatementCsv,
} from "./csv";

describe("parseCsvRows", () => {
  it("splits simple rows and drops blank lines", () => {
    expect(parseCsvRows("a,b\n1,2\n\n3,4\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("handles quoted fields with commas, quotes, and newlines", () => {
    const raw = 'date,desc\n2026-05-01,"Tesco, Metro"\n2026-05-02,"He said ""hi"""';
    expect(parseCsvRows(raw)).toEqual([
      ["date", "desc"],
      ["2026-05-01", "Tesco, Metro"],
      ["2026-05-02", 'He said "hi"'],
    ]);
  });

  it("tolerates CRLF line endings and a missing trailing newline", () => {
    expect(parseCsvRows("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseDate", () => {
  it("accepts ISO, UK slash/dash, and 'DD Mon YYYY' forms", () => {
    expect(parseDate("2026-05-01")).toBe("2026-05-01");
    expect(parseDate("01/05/2026")).toBe("2026-05-01"); // day-first
    expect(parseDate("1-5-26")).toBe("2026-05-01");
    expect(parseDate("01 May 2026")).toBe("2026-05-01");
    expect(parseDate("3 Sept 26")).toBe("2026-09-03");
  });

  it("rejects nonsense and impossible dates", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate("45/13/2026")).toBeNull();
  });
});

describe("parseAmount", () => {
  it("strips currency and separators, keeps the sign", () => {
    expect(parseAmount("£1,234.50")).toBe(1234.5);
    expect(parseAmount("-42.10")).toBe(-42.1);
    expect(parseAmount("(42.10)")).toBe(-42.1); // parentheses = negative
    expect(parseAmount("3200.00")).toBe(3200);
  });

  it("returns null for blanks and non-numbers", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("  ")).toBeNull();
    expect(parseAmount("-")).toBeNull();
  });
});

describe("detectColumns", () => {
  it("maps a single signed-amount layout", () => {
    expect(detectColumns(["Date", "Description", "Amount", "Balance"])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
      debit: undefined,
      credit: undefined,
    });
  });

  it("maps a separate paid-out/paid-in layout, ignoring punctuation/case", () => {
    const m = detectColumns(["Date", "Narrative", "Paid Out (£)", "Paid In (£)"]);
    expect(m).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 });
  });

  it("returns null without the minimum columns", () => {
    expect(detectColumns(["Date", "Balance"])).toBeNull(); // no description/amount
  });
});

describe("parseStatementCsv", () => {
  it("parses a signed-amount statement into directional drafts", () => {
    const raw = [
      "Date,Description,Amount",
      "2026-05-01,Tesco,-42.10",
      "2026-05-03,Salary,3200.00",
      "01/05/2026,Coffee,-3.50",
    ].join("\n");
    const { drafts, skipped, totalRows, mapping } = parseStatementCsv(raw);

    expect(mapping).toMatchObject({ date: 0, description: 1, amount: 2 });
    expect(totalRows).toBe(3);
    expect(skipped).toBe(0);
    expect(drafts).toEqual([
      { date: "2026-05-01", description: "Tesco", amount: 42.1, direction: "out", category: "uncategorised" },
      { date: "2026-05-03", description: "Salary", amount: 3200, direction: "in", category: "uncategorised" },
      { date: "2026-05-01", description: "Coffee", amount: 3.5, direction: "out", category: "uncategorised" },
    ]);
  });

  it("parses a debit/credit statement and skips unparseable rows", () => {
    const raw = [
      "Date,Details,Paid Out,Paid In",
      "01 May 2026,RENT,1350.00,",
      "02 May 2026,REFUND,,12.00",
      ",MALFORMED,,", // no date → skipped
      "03 May 2026,ZERO,0,0", // zero both sides → skipped
    ].join("\n");
    const { drafts, skipped } = parseStatementCsv(raw);

    expect(drafts).toEqual([
      { date: "2026-05-01", description: "RENT", amount: 1350, direction: "out", category: "uncategorised" },
      { date: "2026-05-02", description: "REFUND", amount: 12, direction: "in", category: "uncategorised" },
    ]);
    expect(skipped).toBe(2);
  });

  it("returns an empty result with no mapping when the header is unrecognised", () => {
    const { drafts, mapping, skipped } = parseStatementCsv("foo,bar\n1,2");
    expect(drafts).toEqual([]);
    expect(mapping).toBeNull();
    expect(skipped).toBe(2);
  });

  it("treats the first row as data when a mapping override is supplied", () => {
    const raw = "2026-05-01,Tesco,-42.10";
    const { drafts } = parseStatementCsv(raw, { date: 0, description: 1, amount: 2 });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ description: "Tesco", direction: "out" });
  });
});
