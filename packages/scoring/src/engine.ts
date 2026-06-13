// Deterministic grading engine. Two jobs, both ported verbatim from the prototype:
//  1. catFromScores / surfaceCatFallback / computeSubgrades — derive subgrades from
//     measured + AI data.
//  2. buildEngineFallback — produce a guaranteed-sane SynthResult with NO AI reply,
//     so a grade can never render as zero.
// Plus snapSynth / clampScore1000 / isValidSynth, the validation the prototype applied
// to the AI scorer's reply before trusting it.

import { BAND, toHalf } from "./tables.js";
import type {
  CornerScores,
  EdgeScores,
  Finding,
  Subgrades,
  SynthResult,
} from "./types.js";

export function catFromScores(obj: CornerScores | EdgeScores | null | undefined): number | null {
  const vals = Object.values(obj || {})
    .map((o) => (o ? Number(o.score) : NaN))
    .filter((n) => isFinite(n) && n > 0);
  if (!vals.length) return null;
  const mn = Math.min(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round((mn * 0.6 + mean * 0.4) * 2) / 2;
}

export function surfaceCatFallback(segVals: number[], verified: Finding[] | null | undefined): number {
  let base = segVals.length
    ? Math.round(
        (Math.min(...segVals) * 0.5 + (segVals.reduce((a, b) => a + b, 0) / segVals.length) * 0.5) * 2
      ) / 2
    : 9;
  (verified || []).forEach((f) => {
    if (f.verdict !== "damage") return;
    if (f.type === "crease") base = Math.min(base, 4.5);
    else if (f.type === "wrinkle") base = Math.min(base, f.onBack ? 6.5 : 5.5);
    else if (f.type === "dent") base = Math.min(base, f.severity === "severe" ? 6 : 7.5);
    else if (f.severity === "severe") base = Math.min(base, 6);
    else if (f.severity === "moderate") base = Math.min(base, 8);
  });
  return Math.max(1, base);
}

export interface SubgradeInputs {
  corners: CornerScores | null;
  edges: EdgeScores | null;
  segVals: number[];
  verified: Finding[];
  centeringGrade: number | null;
}

export function computeSubgrades(i: SubgradeInputs): Subgrades {
  return {
    centering: i.centeringGrade,
    corners: catFromScores(i.corners),
    edges: catFromScores(i.edges),
    surface: surfaceCatFallback(i.segVals, i.verified),
  };
}

export function engineGradeOf(s: Subgrades): number | null {
  const cats = [s.centering, s.corners, s.edges, s.surface].filter((g): g is number => g != null);
  return cats.length ? Math.min(...cats) : null;
}

// Guaranteed-sane grade with no AI scorer reply. `psaCap` is the measured PSA front
// cap, or null when centering was not measured (then PSA falls back to the grade).
export function buildEngineFallback(opts: { subgrades: Subgrades; psaCap: number | null }): SynthResult {
  const { subgrades, psaCap } = opts;
  const engineGrade = engineGradeOf(subgrades);
  const g = engineGrade != null ? engineGrade : 7;
  const [lo, hi] = BAND[g] || [700, 749];
  return {
    grade10: g,
    score1000: Math.round((lo + hi) / 2),
    low: Math.max(1, g - 1),
    high: Math.min(10, g + 0.5),
    confidence: "low",
    companyGrades: { psa: psaCap != null ? Math.min(g, psaCap) : g, cgc: g },
    subgrades,
    dingIdx: [],
    blockers: ["engine fallback — AI scorer reply invalid"],
    verdict: "Scored by the deterministic engine from measured data; treat as conservative.",
    fallback: true,
  };
}

// Snap every numeric field of an AI scorer reply onto the 0.5 scale (prototype parity).
export function snapSynth<T extends Partial<SynthResult>>(sy: T): T {
  if (sy.grade10 != null) sy.grade10 = toHalf(sy.grade10) as number;
  if (sy.subgrades) {
    (["centering", "corners", "edges", "surface"] as const).forEach(
      (k) => (sy.subgrades![k] = toHalf(sy.subgrades![k]))
    );
  }
  if (sy.companyGrades) {
    sy.companyGrades.psa = toHalf(sy.companyGrades.psa);
    sy.companyGrades.cgc = toHalf(sy.companyGrades.cgc);
  }
  if (sy.low != null) sy.low = toHalf(sy.low);
  if (sy.high != null) sy.high = toHalf(sy.high);
  return sy;
}

export function isValidSynth(sy: Partial<SynthResult> | null | undefined): sy is SynthResult {
  return !!sy && !!sy.grade10 && !!BAND[sy.grade10];
}

// Clamp score1000 into the band for its grade (false precision guard).
export function clampScore1000(sy: SynthResult): SynthResult {
  if (BAND[sy.grade10]) {
    const [lo, hi] = BAND[sy.grade10];
    sy.score1000 = Math.max(lo, Math.min(hi, Math.round(sy.score1000 || lo)));
  }
  return sy;
}
