/**
 * Component types for the Finance engine — the freedom math of the Financial Domain.
 *
 * Everything here is plain data — no DB, no framework, no I/O — so the engine
 * stays pure and unit-testable. Persistence and validation live at the edges.
 */

/** A FIRE flavour. Affects how the target spend (and thus magic number) is framed. */
export type FireStyle = "lean" | "full" | "fat" | "coast" | "barista";

/** The inputs a user provides to compute their financial-freedom trajectory. */
export interface FinancialInputs {
  /** Freedom-generating assets today (liquid/invested — excludes e.g. primary home). */
  currentInvested: number;
  /** Net amount invested per month going forward. */
  monthlyContribution: number;
  /** Target annual spend once free, in today's money. */
  annualSpend: number;
  /** Expected real (after-inflation) annual return, as a percent e.g. 5 = 5%. */
  realReturnPct: number;
  /** Safe withdrawal rate, as a percent e.g. 4 = 4%. */
  withdrawalRatePct: number;
  /** Optional: income that continues in freedom (pension, part-time), per year. */
  ongoingAnnualIncome?: number;
  /** Optional: current age, used to express the freedom date as an age. */
  currentAge?: number;
}

/** One point on the projected portfolio path. */
export interface ProjectionPoint {
  /** Whole years from today. */
  year: number;
  /** Projected freedom-generating portfolio value at that point. */
  value: number;
}

/** The computed trajectory toward financial freedom. */
export interface Projection {
  /** The portfolio value required to be financially free. */
  magicNumber: number;
  /** Coast number: invested-today figure that reaches the magic number by the target with growth alone. */
  coastNumber: number | null;
  /** Whole months until the portfolio reaches the magic number, or null if not within the horizon. */
  monthsToFreedom: number | null;
  /** Calendar year of freedom, or null if not reached within the horizon. */
  freedomYear: number | null;
  /** Age at freedom, if currentAge was provided and freedom is reached. */
  freedomAge: number | null;
  /** Progress toward the magic number today, 0–1. */
  progress: number;
  /** Year-by-year portfolio path, including year 0 (today). */
  series: ProjectionPoint[];
}
