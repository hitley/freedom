/**
 * Domain types for the vision & goal capture phase — step (1) of every freedom
 * dimension: "project your goals and *why* they matter".
 *
 * Plain data only — no DB, no framework, no I/O — so it stays portable and
 * unit-testable. Persistence and validation live at the edges (see schema below).
 */

import type { FireStyle } from "@/lib/finance";

/**
 * What a user articulates before any numbers: the picture of freedom, why it
 * matters, and the concrete goal that the financial engine then works toward.
 */
export interface FreedomVision {
  /** One line: what does freedom look like? e.g. "Sail the Med with my family". */
  headline: string;
  /** The deeper why — a short narrative of what changes when you're free. */
  why: string;
  /** Selected motivation ids (see MOTIVATIONS) — the forces behind the goal. */
  motivations: string[];
  /** The flavour of freedom being funded — frames the target spend. */
  fireStyle: FireStyle;
  /** Target annual spend once free, in today's money — the goal the engine funds. */
  annualSpend: number;
  /** Optional aspiration: the age you'd love to be free by. */
  targetAge?: number;
}

/** A motivation chip — the human reasons that sit behind a freedom goal. */
export interface Motivation {
  id: string;
  label: string;
  /** A single emoji glyph, used as a lightweight visual marker. */
  glyph: string;
}

export const MOTIVATIONS: Motivation[] = [
  { id: "family", label: "Family", glyph: "👨‍👩‍👧" },
  { id: "time", label: "Time", glyph: "⏳" },
  { id: "health", label: "Health", glyph: "🌱" },
  { id: "travel", label: "Travel", glyph: "✈️" },
  { id: "creativity", label: "Creativity", glyph: "🎨" },
  { id: "security", label: "Security", glyph: "🛡️" },
  { id: "purpose", label: "Purpose", glyph: "🧭" },
  { id: "adventure", label: "Adventure", glyph: "🏔️" },
];

/** Presentation + a sensible default spend for each FIRE flavour. */
export interface FireStyleMeta {
  id: FireStyle;
  label: string;
  /** One-line description shown on the selectable card. */
  blurb: string;
  /** A reasonable starting annual spend (GBP) used to prefill the goal. */
  defaultSpend: number;
}

export const FIRE_STYLES: FireStyleMeta[] = [
  {
    id: "lean",
    label: "Lean",
    blurb: "Cover the essentials and keep life simple.",
    defaultSpend: 25_000,
  },
  {
    id: "full",
    label: "Full",
    blurb: "Fund your current lifestyle, indefinitely.",
    defaultSpend: 50_000,
  },
  {
    id: "fat",
    label: "Fat",
    blurb: "Freedom with plenty of room to splurge.",
    defaultSpend: 100_000,
  },
  {
    id: "barista",
    label: "Barista",
    blurb: "Part-time income covers part of the gap.",
    defaultSpend: 40_000,
  },
  {
    id: "coast",
    label: "Coast",
    blurb: "Stop saving — let growth carry you to the goal.",
    defaultSpend: 50_000,
  },
];

/** Look up the metadata for a FIRE style, falling back to "full". */
export function fireStyleMeta(style: FireStyle): FireStyleMeta {
  return FIRE_STYLES.find((s) => s.id === style) ?? FIRE_STYLES[1];
}

/** The blank-slate vision a fresh user starts the flow from. */
export const EMPTY_VISION: FreedomVision = {
  headline: "",
  why: "",
  motivations: [],
  fireStyle: "full",
  annualSpend: fireStyleMeta("full").defaultSpend,
  targetAge: undefined,
};
