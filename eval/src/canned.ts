// Synthetic, well-formed AI responses used ONLY to seed the demo fixtures so the harness
// runs end-to-end offline. Real holdout fixtures (recorded from the live proxy) replace
// these; the harness code does not change. Deterministic per-card via `seed`.

import { BAND } from "@j1m/scoring";

// Grades that exist on the BAND ladder (note: no 9.5 rung).
const GRADES = [8, 8.5, 9, 10];

export function gradeForSeed(seed: number): number {
  return GRADES[seed % GRADES.length];
}

export function cannedResponse(prompt: string, seed: number): string {
  const c = gradeForSeed(seed);
  switch (prompt) {
    case "id":
      return JSON.stringify({
        name: `Demo Card ${seed}`, set: "TEST SET", number: String(seed + 1),
        holo: true, frame: "fullart", texturedFoil: true,
      });
    case "corners":
      return JSON.stringify({
        tl: { score: c, note: "clean" }, tr: { score: c, note: "clean" },
        bl: { score: c, note: "clean" }, br: { score: c, note: "clean" },
      });
    case "edges":
      return JSON.stringify({
        top: { score: c, note: "clean" }, bottom: { score: c, note: "clean" },
        left: { score: c, note: "clean" }, right: { score: c, note: "clean" },
      });
    case "segment":
      // Constant (not seed-varying): synthetic cards have uniform regions whose segment
      // crops collide across cards; a constant keeps colliding cache rows content-identical
      // and the score payload reproducible. Final surface grade still varies via `score`.
      return JSON.stringify({ cleanScore: 9, findings: [] });
    case "structural":
      return JSON.stringify({ findings: [] });
    case "verify":
      return JSON.stringify({ verdicts: [] });
    case "score": {
      const [lo, hi] = BAND[c];
      return JSON.stringify({
        grade10: c,
        score1000: Math.round((lo + hi) / 2),
        low: Math.max(1, c - 0.5),
        high: Math.min(10, c),
        confidence: "high",
        companyGrades: { psa: Math.max(1, c - 0.5), cgc: Math.max(1, c - 0.5) },
        subgrades: { centering: c, corners: c, edges: c, surface: c },
        dingIdx: [],
        blockers: [],
        verdict: "Submit-worthy demo card.",
      });
    }
    case "listing":
      return JSON.stringify({
        listingTitle: `Demo Card ${seed} — TEST SET #${seed + 1}`,
        listingBlurb: "Honest demo listing for a synthetic fixture card with measured centering.",
      });
    default:
      return "{}";
  }
}

// Synthetic per-call cost so cost-per-grade is non-zero and varies by depth (vision calls
// cost more than the text-only score/listing calls).
export function cannedCost(prompt: string): { cost: number; inTok: number; outTok: number } {
  const vision = !["score", "listing"].includes(prompt);
  return vision ? { cost: 0.004, inTok: 1500, outTok: 80 } : { cost: 0.0015, inTok: 700, outTok: 120 };
}
