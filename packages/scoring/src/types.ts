// Shared domain types for the grading output. The pipeline and UI consume these;
// the zod schemas in @j1m/schemas validate the raw AI replies that feed them.

export interface ScoreNote {
  score: number;
  note?: string;
}

export type CornerScores = Partial<Record<"tl" | "tr" | "bl" | "br", ScoreNote>>;
export type EdgeScores = Partial<Record<"top" | "bottom" | "left" | "right", ScoreNote>>;

export interface Finding {
  type?: string;
  severity?: "minor" | "moderate" | "severe" | string;
  verdict?: "damage" | "artwork" | "uncertain" | string;
  /** Verification note kept for findings cleared as artwork/texture. */
  vnote?: string;
  onBack?: boolean;
  loc?: string;
  origin?: "surface" | "structural" | string;
  u?: number;
  v?: number;
  w?: number;
  h?: number;
}

export interface Subgrades {
  centering: number | null;
  corners: number | null;
  edges: number | null;
  surface: number | null;
}

export interface SynthResult {
  grade10: number;
  score1000: number;
  low: number | null;
  high: number | null;
  confidence: "low" | "medium" | "high" | string;
  companyGrades: { psa: number | null; cgc: number | null };
  subgrades: Subgrades;
  dingIdx: number[];
  blockers: string[];
  verdict: string;
  fallback?: boolean;
  listingTitle?: string;
  listingBlurb?: string;
}
