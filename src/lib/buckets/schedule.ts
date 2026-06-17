/**
 * Recurrence engine for scheduled bucket payments.
 *
 * Pure and deterministic — no hidden `new Date()`, every entry point takes the
 * window it should expand over. Dates are handled as **local-midnight** values
 * (`new Date(y, m-1, d)`) so day-of-month and weekday maths don't drift across
 * timezones or DST. Model dates are date-only ISO strings (`YYYY-MM-DD`).
 */

import type { Recurrence } from "./types";

/** Parse a `YYYY-MM-DD` string to a local-midnight Date. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Format a Date as a `YYYY-MM-DD` string (local). */
export function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Strip any time component, returning local midnight of the same day. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Last calendar day of the month containing `date` (28–31). */
export function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** A day-of-month clamped to a given month's real length (e.g. 31 → 28 in Feb). */
export function clampDayOfMonth(year: number, monthIndex: number, day: number): number {
  return Math.min(day, lastDayOfMonth(year, monthIndex));
}

const inWindow = (d: Date, afterExclusive: Date, untilInclusive: Date) =>
  d.getTime() > afterExclusive.getTime() && d.getTime() <= untilInclusive.getTime();

/**
 * Every date a recurrence fires within `(afterExclusive, untilInclusive]`,
 * sorted ascending. Honours the recurrence's own `startDate`/`endDate` bounds.
 */
export function occurrences(
  rec: Recurrence,
  afterExclusive: Date,
  untilInclusive: Date,
): Date[] {
  const start = startOfDay(parseISO(rec.startDate));
  const end = rec.endDate ? startOfDay(parseISO(rec.endDate)) : null;
  // The effective upper bound is the earlier of the window end and the schedule end.
  const cap =
    end && end.getTime() < untilInclusive.getTime() ? end : untilInclusive;
  const interval = Math.max(1, rec.interval ?? 1);
  const out: Date[] = [];

  if (rec.freq === "once") {
    if (inWindow(start, afterExclusive, cap)) out.push(start);
    return out;
  }

  if (rec.freq === "weekly") {
    const targetDow = rec.weekday ?? start.getDay();
    // First on-or-after `start` landing on the target weekday.
    let cursor = addDays(start, (targetDow - start.getDay() + 7) % 7);
    const stepDays = 7 * interval;
    while (cursor.getTime() <= cap.getTime()) {
      if (cursor.getTime() > afterExclusive.getTime()) out.push(new Date(cursor));
      cursor = addDays(cursor, stepDays);
    }
    return out;
  }

  // monthly
  const day = rec.dayOfMonth ?? start.getDate();
  // Anchor on the start month, then step `interval` months at a time.
  let anchor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (true) {
    const y = anchor.getFullYear();
    const mi = anchor.getMonth();
    const fire = new Date(y, mi, clampDayOfMonth(y, mi, day));
    if (fire.getTime() > cap.getTime()) break;
    if (
      fire.getTime() >= start.getTime() &&
      fire.getTime() > afterExclusive.getTime()
    ) {
      out.push(fire);
    }
    anchor = addMonths(anchor, interval);
  }
  return out;
}
