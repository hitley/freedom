import { z } from "zod";
import { MOTIVATIONS } from "./types";

export * from "./types";

/**
 * Validation at the trust boundary. Anything arriving from the capture flow, an
 * API, or an import passes through here before it is stored or trusted. (No DB
 * yet — this is ready for when the vision is persisted per instance.)
 */
export const freedomVisionSchema = z.object({
  headline: z.string().trim().min(1).max(120),
  why: z.string().trim().max(2000),
  motivations: z.array(z.enum(MOTIVATIONS.map((m) => m.id) as [string, ...string[]])),
  fireStyle: z.enum(["lean", "full", "fat", "coast", "barista"]),
  annualSpend: z.number().min(0).max(1e9),
  targetAge: z.number().int().min(18).max(120).optional(),
});

export type FreedomVisionInput = z.input<typeof freedomVisionSchema>;
