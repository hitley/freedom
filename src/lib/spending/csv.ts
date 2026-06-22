/**
 * Deterministic CSV → candidate transactions — the AI-free **Extract** stage of the
 * ingestion pipeline (see `design-notes/001-ingestion-inbox-bookkeeper.md`). Pure and
 * I/O-free: given the raw text of a bank/current-account statement export, it produces
 * {@link DraftTransaction}s the inbox can dedupe and propose for review.
 *
 * UK statement exports vary (Monzo, Starling, Barclays, Amex…), so columns are located
 * by **fuzzy header matching** rather than a fixed schema, and the detected mapping is
 * returned so a future per-bank mapping step can override it. Two amount layouts are
 * handled: a single signed `amount` column (negative = money out), or separate
 * debit/credit ("paid out" / "paid in") columns.
 */

import type { DraftTransaction } from "./types";

/** Which column index carries which field. Either `amount`, or `debit`+`credit`. */
export interface ColumnMapping {
  date: number;
  description: number;
  /** Single signed-amount column (negative = out). */
  amount?: number;
  /** Separate money-out column. */
  debit?: number;
  /** Separate money-in column. */
  credit?: number;
}

/** Outcome of parsing a statement: the drafts plus what was detected and skipped. */
export interface CsvParseResult {
  drafts: DraftTransaction[];
  /** The header→field mapping that was used, or null if no header was recognised. */
  mapping: ColumnMapping | null;
  /** Data rows seen (excluding the header). */
  totalRows: number;
  /** Rows that couldn't be parsed (bad date/amount, blank) and were dropped. */
  skipped: number;
}

/* ----------------------------------------------------------------------------
 * Low-level CSV → rows. A small RFC-4180-ish state machine: handles quoted
 * fields, embedded commas/newlines, and "" escaping. Tolerant of CRLF and LF.
 * ------------------------------------------------------------------------- */

export function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];

    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // End the row on a newline; swallow the \n of a \r\n pair.
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // Flush a trailing field/row that wasn't newline-terminated.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows (e.g. trailing blank lines).
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/* ----------------------------------------------------------------------------
 * Header detection. Match each header cell against known aliases. Case- and
 * punctuation-insensitive so "Paid Out (£)" still matches "paid out".
 * ------------------------------------------------------------------------- */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const ALIASES = {
  date: ["date", "transaction date", "posting date", "value date", "date of transaction"],
  description: [
    "description",
    "details",
    "narrative",
    "reference",
    "transaction",
    "memo",
    "name",
    "payee",
    "merchant",
  ],
  amount: ["amount", "value", "transaction amount"],
  debit: ["debit", "paid out", "money out", "withdrawal", "withdrawn", "out", "debit amount"],
  credit: ["credit", "paid in", "money in", "deposit", "received", "in", "credit amount"],
} as const;

/** Find the first column whose header matches any of the given aliases. */
function findColumn(header: string[], aliases: readonly string[]): number | undefined {
  const normed = header.map(norm);
  for (const alias of aliases) {
    const idx = normed.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return undefined;
}

/**
 * Detect the column mapping from a header row, or null if it doesn't carry the
 * minimum (a date, a description, and at least one amount column).
 */
export function detectColumns(header: string[]): ColumnMapping | null {
  const date = findColumn(header, ALIASES.date);
  const description = findColumn(header, ALIASES.description);
  const amount = findColumn(header, ALIASES.amount);
  const debit = findColumn(header, ALIASES.debit);
  const credit = findColumn(header, ALIASES.credit);

  if (date === undefined || description === undefined) return null;
  if (amount === undefined && debit === undefined && credit === undefined) return null;

  return { date, description, amount, debit, credit };
}

/* ----------------------------------------------------------------------------
 * Value parsing — dates and money, both tolerant of the formats UK exports use.
 * ------------------------------------------------------------------------- */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Normalise a date cell to a `YYYY-MM-DD` string, or null if unrecognised. */
export function parseDate(value: string): string | null {
  const s = value.trim();
  if (!s) return null;

  // Already ISO (YYYY-MM-DD).
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // DD/MM/YYYY or DD-MM-YYYY (UK day-first), 2- or 4-digit year.
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return makeIso(year, month, day);
  }

  // DD MMM YYYY (e.g. "01 May 2026"), 2- or 4-digit year.
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2}|\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (month) return makeIso(year, month, day);
  }

  return null;
}

/** Build a validated YYYY-MM-DD, rejecting impossible day/month values. */
function makeIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Parse a money cell to a number (sign preserved). Strips currency symbols and
 * thousands separators; treats parentheses as negative ("(42.10)" → -42.10).
 * Returns null for a blank or unparseable cell.
 */
export function parseAmount(value: string): number | null {
  let s = value.trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  // Strip everything except digits, sign, and decimal point.
  s = s.replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

/* ----------------------------------------------------------------------------
 * The parser. Locate the header, then map each data row to a draft transaction.
 * ------------------------------------------------------------------------- */

/**
 * Parse a statement CSV into draft transactions. Pass `mappingOverride` to skip
 * header detection (e.g. once a per-bank mapping has been confirmed). Rows missing a
 * valid date or a non-zero amount are skipped, not failed — a statement is mostly
 * good rows with the odd summary line.
 */
export function parseStatementCsv(
  raw: string,
  mappingOverride?: ColumnMapping,
): CsvParseResult {
  const rows = parseCsvRows(raw);
  if (rows.length === 0) {
    return { drafts: [], mapping: mappingOverride ?? null, totalRows: 0, skipped: 0 };
  }

  // With an override the first row is data; otherwise the first row is the header.
  const mapping = mappingOverride ?? detectColumns(rows[0]);
  if (!mapping) {
    return { drafts: [], mapping: null, totalRows: rows.length, skipped: rows.length };
  }
  const dataRows = mappingOverride ? rows : rows.slice(1);

  const drafts: DraftTransaction[] = [];
  let skipped = 0;

  for (const cells of dataRows) {
    const draft = rowToDraft(cells, mapping);
    if (draft) drafts.push(draft);
    else skipped++;
  }

  return { drafts, mapping, totalRows: dataRows.length, skipped };
}

/** Map one row of cells to a draft, or null if it can't be parsed. */
function rowToDraft(cells: string[], mapping: ColumnMapping): DraftTransaction | null {
  const date = parseDate(cells[mapping.date] ?? "");
  if (!date) return null;

  const description = (cells[mapping.description] ?? "").trim();
  if (!description) return null;

  // Resolve a signed amount from either layout.
  let signed: number | null = null;
  if (mapping.amount !== undefined) {
    signed = parseAmount(cells[mapping.amount] ?? "");
  } else {
    const out = mapping.debit !== undefined ? parseAmount(cells[mapping.debit] ?? "") : null;
    const inAmt = mapping.credit !== undefined ? parseAmount(cells[mapping.credit] ?? "") : null;
    if (out && out !== 0) signed = -Math.abs(out);
    else if (inAmt && inAmt !== 0) signed = Math.abs(inAmt);
  }

  if (signed === null || signed === 0) return null;

  return {
    date,
    description: description.slice(0, 200),
    amount: Math.abs(signed),
    direction: signed < 0 ? "out" : "in",
    category: "uncategorised",
  };
}
