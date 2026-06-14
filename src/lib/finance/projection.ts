import type { FinancialInputs, Projection, ProjectionPoint } from "./types";

/** Longest horizon we project before giving up on reaching the number. */
const MAX_YEARS = 60;

/**
 * The "magic number": the freedom-generating portfolio that sustains the target
 * spend at the chosen safe withdrawal rate. Ongoing income (pension, part-time)
 * reduces the spend the portfolio must cover.
 *
 *   magic = max(0, annualSpend - ongoingIncome) / (swr / 100)
 */
export function magicNumber(inputs: FinancialInputs): number {
  const { annualSpend, withdrawalRatePct, ongoingAnnualIncome = 0 } = inputs;
  const coveredBySpend = Math.max(0, annualSpend - ongoingAnnualIncome);
  if (withdrawalRatePct <= 0) return Infinity;
  return coveredBySpend / (withdrawalRatePct / 100);
}

/**
 * Coast number: the amount that, invested today and left to grow with NO further
 * contributions, reaches the magic number by `yearsToTarget`. Below this you must
 * keep contributing; at or above it you can "coast".
 *
 *   coast = magic / (1 + r)^years
 */
export function coastNumber(
  inputs: FinancialInputs,
  yearsToTarget: number,
): number | null {
  if (yearsToTarget <= 0) return null;
  const r = inputs.realReturnPct / 100;
  const target = magicNumber(inputs);
  if (!isFinite(target)) return null;
  return target / Math.pow(1 + r, yearsToTarget);
}

/**
 * Project the freedom-generating portfolio forward month by month, compounding at
 * the real return and adding contributions, until it reaches the magic number or
 * the horizon runs out. Pure and deterministic.
 */
export function project(inputs: FinancialInputs): Projection {
  const target = magicNumber(inputs);
  const monthlyRate = inputs.realReturnPct / 100 / 12;

  const series: ProjectionPoint[] = [{ year: 0, value: round(inputs.currentInvested) }];
  let value = inputs.currentInvested;
  let monthsToFreedom: number | null = inputs.currentInvested >= target ? 0 : null;

  for (let month = 1; month <= MAX_YEARS * 12; month++) {
    value = value * (1 + monthlyRate) + inputs.monthlyContribution;
    if (monthsToFreedom === null && value >= target) {
      monthsToFreedom = month;
    }
    if (month % 12 === 0) {
      series.push({ year: month / 12, value: round(value) });
    }
  }

  const freedomYear =
    monthsToFreedom === null
      ? null
      : new Date().getFullYear() + Math.ceil(monthsToFreedom / 12);
  const freedomAge =
    monthsToFreedom === null || inputs.currentAge === undefined
      ? null
      : inputs.currentAge + Math.ceil(monthsToFreedom / 12);

  const progress = !isFinite(target) || target <= 0
    ? 0
    : Math.min(1, inputs.currentInvested / target);

  const yearsToTarget = monthsToFreedom === null ? MAX_YEARS : monthsToFreedom / 12;

  return {
    magicNumber: round(target),
    coastNumber: round0(coastNumber(inputs, yearsToTarget)),
    monthsToFreedom,
    freedomYear,
    freedomAge,
    progress,
    series,
  };
}

function round(n: number): number {
  return Math.round(n);
}

function round0(n: number | null): number | null {
  return n === null ? null : Math.round(n);
}
