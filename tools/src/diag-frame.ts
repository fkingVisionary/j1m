// Diagnostic: replicates detectInnerFrame's per-side logic with logging so we can see
// WHY the inner-frame lock fails on a given card (threshold too high from busy art?
// segments disagree? border outside the search band?).

import {
  autoQuad, canvasFrom, rectify, lumOf, FULL_QUAD,
} from "@j1m/cv";
import { nodeCanvasFactory as cf, loadNormalizedImage } from "@j1m/canvas-node";

const path = process.argv[2];

const norm = await loadNormalizedImage(path);
const im = await cf.loadImage(norm.dataUrl);
const src = canvasFrom(cf, im, 2400);
const quad = autoQuad(canvasFrom(cf, im, 1100)) || FULL_QUAD;
const rect = rectify(cf, src, quad);
const w = rect.width, h = rect.height;
const g = lumOf(rect.getContext("2d").getImageData(0, 0, w, h));
const gX = (x: number, y: number) => Math.abs(g[y * w + x + 1] - g[y * w + x - 1]);
const gY = (x: number, y: number) => Math.abs(g[(y + 1) * w + x] - g[(y - 1) * w + x]);

console.log(`rectified ${w}x${h}`);

for (const [axis, fromStart, name] of [
  ["x", true, "LEFT"], ["x", false, "RIGHT"], ["y", true, "TOP"], ["y", false, "BOTTOM"],
] as const) {
  const dim = axis === "x" ? w : h, perp = axis === "x" ? h : w;
  const p0 = Math.round(perp * 0.22), p1 = Math.round(perp * 0.78);
  const segs: [number, number][] = [
    [p0, Math.round(perp * 0.41)],
    [Math.round(perp * 0.41), Math.round(perp * 0.59)],
    [Math.round(perp * 0.59), p1],
  ];
  let nf = 0, nc = 0;
  const strip = Math.max(3, Math.round(dim * 0.008));
  for (let d = 2; d < strip; d++)
    for (let p = p0; p < p1; p += 6) {
      const pos = fromStart ? d : dim - 1 - d;
      nf += axis === "x" ? gX(pos, p) : gY(p, pos); nc++;
    }
  const th = Math.max(11, (nf / Math.max(nc, 1)) * 3.5 + 6);
  const lo = Math.max(4, Math.round(dim * 0.01)), hi = Math.round(dim * 0.18);
  const found = segs.map(([a, b], si) => {
    for (let d = lo; d < hi; d++) {
      const pos = fromStart ? d : dim - 1 - d;
      let hit = 0, tot = 0;
      for (let p = a; p < b; p += 4) {
        const v = axis === "x" ? gX(pos, p) : gY(p, pos);
        if (v > th) hit++; tot++;
      }
      if (tot && hit / tot > 0.5) return { si, d, frac: +(d / dim).toFixed(3) };
    }
    return { si, d: -1, frac: null };
  });
  const ok = found.filter((f) => f.frac != null);
  console.log(`${name}: th=${th.toFixed(1)} lo=${lo} hi=${hi} noiseFloorMean=${(nf / Math.max(nc, 1)).toFixed(1)} segs=${found.map((f) => f.frac).join(",")} -> ${ok.length >= 2 ? "LOCK @" + (ok.length ? ok[Math.floor(ok.length / 2)].frac : "?") : "FAIL (" + ok.length + "/3)"}`);
}
