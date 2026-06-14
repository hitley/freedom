import { z } from "zod";

export * from "./types";
export { magicNumber, coastNumber, project } from "./projection";

/**
 * Validation at the trust boundary. Anything arriving from a form, API, or import
 * passes through here before reaching the engine or the database.
 */
export const financialInputsSchema = z.object({
  currentInvested: z.number().min(0).max(1e11),
  monthlyContribution: z.number().min(0).max(1e8),
  annualSpend: z.number().min(0).max(1e9),
  realReturnPct: z.number().min(-20).max(30),
  withdrawalRatePct: z.number().min(0.1).max(20),
  ongoingAnnualIncome: z.number().min(0).max(1e9).optional(),
  currentAge: z.number().int().min(0).max(120).optional(),
});

export type FinancialInputsInput = z.input<typeof financialInputsSchema>;
