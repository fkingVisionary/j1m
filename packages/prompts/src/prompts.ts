// Versioned prompt registry. Every prompt is a named record carrying its own version;
// any cached result, logged call, or harvested grade records `${name}@${version}`.
//
// Behavior parity note: all prompt text below is byte-identical to the v7 prototype.
// Each record may declare a `model` override (constraint #5 lets cheap calls use a
// smaller model) but they are intentionally left UNSET in this pass so every call uses
// the proxy's single default model — preserving outputs exactly. Flip a record's
// `model` later (a one-line change) once the eval proves a cheaper model holds.

import { RUBRIC, RUBRIC_VERSION } from "./rubric.js";

export interface PromptSpec<A extends unknown[] = []> {
  name: string;
  version: string;
  /** Optional per-call model override; unset => proxy default model. */
  model?: string;
  build: (...args: A) => string;
}

export const ID_PROMPT: PromptSpec = {
  name: "id",
  version: "v1",
  build: () =>
    `Identify this trading card (image is rectified to the card only). texturedFoil = card uses factory texture-stamped/embossed foil (most Scarlet & Violet era Pokemon illustration rares and SIRs do). ONLY raw JSON:
{"name":str,"set":str,"number":str,"holo":bool,"frame":"bordered"|"fullart","texturedFoil":bool}`,
};

export const CORNER_PROMPT: PromptSpec = {
  name: "corners",
  version: "v1",
  build: () =>
    `2x2 composite: the SAME card's four corners at high zoom, labeled TL TR BL BR. Grade each 1-10 (0.5 steps) for physical wear ONLY: whitening, fray, fill, dents, rounded tips (TAG rubric: 10 = sharp w/ only minor fill/fray under magnification; 9 = up to two very light touches; 8 = one corner minor wear; 7 = slight bend/ding; 6 = slight rounding). Holo/art texture is NOT damage. ONLY raw JSON, notes <=6 words:
{"tl":{"score":n,"note":str},"tr":{"score":n,"note":str},"bl":{"score":n,"note":str},"br":{"score":n,"note":str}}`,
};

export const EDGE_PROMPT: PromptSpec = {
  name: "edges",
  version: "v1",
  build: () =>
    `Composite: the SAME card's four edges at high zoom, rows labeled TOP BOTTOM LEFT RIGHT (vertical edges rotated horizontal). Grade each 1-10 (0.5 steps): whitening, chips, nicks, silvering, lifting (TAG rubric: 10 = minor fill/fray under magnification only; 9 = minor wear 1-2 edges; 8 = wear+minor chipping; 7 = notch/lifting). Art/holo at the edge is NOT damage. ONLY raw JSON, notes <=6 words:
{"top":{"score":n,"note":str},"bottom":{"score":n,"note":str},"left":{"score":n,"note":str},"right":{"score":n,"note":str}}`,
};

export const SEGMENT_PROMPT: PromptSpec<[lbl: string, textured: boolean]> = {
  name: "segment",
  version: "v1",
  build: (lbl, textured) =>
    `Image 1: segment "${lbl}" of a card front (color, very high zoom — one of 12 segments). Image 2: SAME segment, relief filter (art/holo color vanish; physical texture remains).
${textured ? "FACTORY TEXTURE-STAMPED foil: an all-over embossed pattern fills the relief — NORMAL, not damage. Only report marks that break or cross the uniform pattern." : "Etched holofoil produces relief texture — normal."}
Defect signatures: scratches = thin lines CROSSING art elements; print lines = perfectly straight, full-span; DENTS = isolated dimples with shadow ring in relief; whitening; stains (color only).
Tasks: 1) cleanScore 0-10 for THIS segment's surface (10 = flawless at this zoom; deduct for any physical defect). 2) Report ONLY high-confidence physical defects (max 2; empty list is a good answer). ONLY raw JSON, notes <=6 words:
{"cleanScore":n,"findings":[{"loc":"e.g. NEAR HP","type":str,"severity":"minor"|"moderate"|"severe","u":0-100,"v":0-100,"w":2-50,"h":2-50,"note":str}]}
u,v,w,h are % of THIS SEGMENT (u,v = defect top-left).`,
};

export const STRUCT_PROMPT: PromptSpec<[textured: boolean, hasBack: boolean, hasRake: boolean]> = {
  name: "structural",
  version: "v1",
  build: (textured, hasBack, hasRake) => {
    let n = 3;
    let imgs = `Image 1: full card front (color). Image 2: fine relief. Image 3: COARSE relief — fine texture suppressed, only LONG ridges survive.`;
    if (hasBack) { n++; imgs += ` Image ${n}: card BACK (color).`; }
    if (hasRake) { n++; imgs += ` Image ${n}: SAME card shot at an ANGLE with raking light/glare — dents and wrinkles appear as distortions inside the glare band; PRIMARY evidence for dents and bends.`; }
    return `STRUCTURAL DAMAGE CHECK (wrinkles / creases / bends / DENTS only).
${imgs}
TAG definitions: wrinkle = light ridge, gloss intact; crease = paper stock broken — whitening along the line in color${hasBack ? ", and usually a matching white line on the BACK" : ""}; bend = broad curvature; dent = local dimple/impression.
${textured ? "Factory texture stamping fills the fine relief with a uniform pattern — IGNORE it. Real structural ridges appear in the COARSE relief and cross/ignore the pattern and artwork." : "Ignore artwork relief; structural ridges appear in the COARSE relief and cross art boundaries."}
${hasBack ? "Cross-check candidates against the back: a front crease almost always shows behind." : ""}
Max 3 findings, ONLY if confident. Empty list is a good answer. ONLY raw JSON, notes <=6 words:
{"findings":[{"loc":str,"type":"wrinkle"|"crease"|"bend"|"dent","severity":"minor"|"moderate"|"severe","u":0-100,"v":0-100,"w":2-60,"h":2-60,"note":str,"onBack":bool}]}
u,v,w,h are % of the card FRONT.`;
  },
};

export const VERIFY_PROMPT: PromptSpec<[n: number, textured: boolean]> = {
  name: "verify",
  version: "v1",
  build: (n, textured) =>
    `Composite: ${n} numbered candidate defects from one card. Each row: #N, color crop (left), relief crop (right) of the SAME spot.
For each decide: "damage" (scratch/print line/dent/crease/wrinkle/stain), "artwork" (holo pattern, ${textured ? "factory texture stamping, " : ""}printed design), or "uncertain". Be strict — texture and printed lines following the art are artwork. ONLY raw JSON:
{"verdicts":[{"i":1,"v":"damage"|"artwork"|"uncertain","note":"<=5 words"}]}`,
};

// Bumps with the rubric: the scorer's behavior depends on the embedded rubric text.
export const SCORE_PROMPT: PromptSpec<[payload: unknown]> = {
  name: "score",
  version: `v1+rubric-${RUBRIC_VERSION}`,
  build: (payload) =>
    `You are the head grader at J1m's Grading. Apply the rubric to this measured pre-grade data.
${RUBRIC}
DATA: ${JSON.stringify(payload)}
NOTES: centering grades are MEASURED — use as given. segmentScores are per-segment surface cleanliness 0-10 from the deep sweep. Only "damage" findings can affect grades; "uncertain" only limits confidence. dingIdx = indexes of damage findings that actually gate the final grade. Conservative: photo-based.
ONLY raw JSON, nothing else:
{"grade10":n,"score1000":int,"low":n,"high":n,"confidence":"low"|"medium"|"high",
"companyGrades":{"psa":n,"cgc":n},
"subgrades":{"centering":n,"corners":n,"edges":n,"surface":n},
"dingIdx":[ints],"blockers":[max 3 short],
"verdict":one sentence: submit / trade raw / not grade-worthy + why}`,
};

export const LISTING_PROMPT: PromptSpec<[payload: unknown]> = {
  name: "listing",
  version: "v1",
  build: (payload) =>
    `Write an eBay listing for this graded-condition trading card. DATA: ${JSON.stringify(payload)}
ONLY raw JSON:
{"listingTitle":"<=80 chars with card name, set, number","listingBlurb":"<=45 words honest condition description citing measured centering and condition highlights"}`,
};

export const PROMPTS = {
  id: ID_PROMPT,
  corners: CORNER_PROMPT,
  edges: EDGE_PROMPT,
  segment: SEGMENT_PROMPT,
  structural: STRUCT_PROMPT,
  verify: VERIFY_PROMPT,
  score: SCORE_PROMPT,
  listing: LISTING_PROMPT,
} as const;

export type PromptName = keyof typeof PROMPTS;

export function promptVersion(name: PromptName): string {
  return PROMPTS[name].version;
}
