// Draws synthetic placeholder cards with a known outer boundary (for corner detection)
// and an offset inner frame (for real, measured centering). Writes them under
// fixtures/cards/<id>/front.jpg so the harness exercises the genuine CV path.

import { createCanvas } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES_DIR } from "./fixtures.js";
import { gradeForSeed } from "./canned.js";
import { BAND } from "@j1m/scoring";

export interface CardSpec {
  id: string;
  seed: number;
  frontRel: string;
  gtGrade: number;
  gtScore: number;
  gtSub: { centering: number; corners: number; edges: number; surface: number };
}

export function generateCards(count = 4): CardSpec[] {
  const specs: CardSpec[] = [];
  for (let seed = 0; seed < count; seed++) {
    const id = `demo-${String(seed + 1).padStart(2, "0")}`;
    const W = 1000, H = 1400;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // Background — strong contrast with the card for the outer-edge gradient.
    ctx.fillStyle = "#7a7a7a";
    ctx.fillRect(0, 0, W, H);

    // Card stock.
    const m = 70, cx = m, cy = m, cw = W - 2 * m, ch = H - 2 * m;
    ctx.fillStyle = "#ededed";
    ctx.fillRect(cx, cy, cw, ch);

    // Inner print frame — left border grows with seed to vary L/R centering.
    const bl = 40 + seed * 12, br = 40, bt = 50, bb = 50;
    const ix = cx + bl, iy = cy + bt, iw = cw - bl - br, ih = ch - bt - bb;
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = "#33557f";
    ctx.fillRect(ix + 10, iy + 10, iw - 20, ih - 20);

    const dir = join(FIXTURES_DIR, "cards", id);
    mkdirSync(dir, { recursive: true });
    const frontRel = join("cards", id, "front.jpg");
    writeFileSync(join(dir, "front.jpg"), canvas.toBuffer("image/jpeg"));

    // Ground truth: offset predictions on alternating cards so metrics are non-trivial.
    const c = gradeForSeed(seed);
    const gtGrade = seed % 2 === 0 ? Math.max(1, c - 0.5) : c;
    const [lo, hi] = BAND[gtGrade] ?? BAND[c];
    specs.push({
      id,
      seed,
      frontRel,
      gtGrade,
      gtScore: Math.round((lo + hi) / 2),
      gtSub: { centering: gtGrade, corners: gtGrade, edges: gtGrade, surface: gtGrade },
    });
  }
  return specs;
}
