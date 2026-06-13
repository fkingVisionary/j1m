// Inner print-frame detection + geometric centering. This is the deterministic core
// the whole product trusts most — centering is MEASURED here, never guessed by AI.
// Ported verbatim from the prototype.

import type { Canvas2D } from "./canvas.js";
import { lumOf } from "./luminance.js";

export interface InnerFrame {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface Centering {
  measured: boolean;
  source: string | null;
  inner?: InnerFrame;
  bordersPct?: { l: number; r: number; t: number; b: number };
  lr?: string;
  tb?: string;
  worst?: number;
}

export function detectInnerFrame(rectCanvas: Canvas2D): InnerFrame | null {
  const w = rectCanvas.width, h = rectCanvas.height;
  const g = lumOf(rectCanvas.getContext("2d").getImageData(0, 0, w, h));
  const gX = (x: number, y: number) => Math.abs(g[y * w + x + 1] - g[y * w + x - 1]);
  const gY = (x: number, y: number) => Math.abs(g[(y + 1) * w + x] - g[(y - 1) * w + x]);

  const firstEdge = (axis: "x" | "y", fromStart: boolean) => {
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
        nf += axis === "x" ? gX(pos, p) : gY(p, pos);
        nc++;
      }
    const th = Math.max(11, (nf / Math.max(nc, 1)) * 3.5 + 6);
    const lo = Math.max(4, Math.round(dim * 0.01)), hi = Math.round(dim * 0.18);
    const found = segs
      .map(([a, b]) => {
        for (let d = lo; d < hi; d++) {
          const pos = fromStart ? d : dim - 1 - d;
          let hit = 0, tot = 0;
          for (let p = a; p < b; p += 4) {
            const v = axis === "x" ? gX(pos, p) : gY(p, pos);
            if (v > th) hit++;
            tot++;
          }
          if (tot && hit / tot > 0.5) return d / dim;
        }
        return null;
      })
      .filter((v): v is number => v != null);
    if (found.length < 2) return null;
    found.sort((a, b) => a - b);
    return found[Math.floor(found.length / 2)];
  };

  const L = firstEdge("x", true), R = firstEdge("x", false);
  const Tt = firstEdge("y", true), Bb = firstEdge("y", false);
  if (L == null || R == null || Tt == null || Bb == null) return null;
  return { l: L, r: 1 - R, t: Tt, b: 1 - Bb };
}

export function centeringFromInner(inner: InnerFrame | null, source: string | null): Centering {
  if (!inner) return { measured: false, source: null };
  const L = inner.l, R = 1 - inner.r, Tt = inner.t, Bb = 1 - inner.b;
  const ratio = (a: number, b: number) => {
    const big = Math.max(a, b), tot = a + b || 1;
    return Math.round((big / tot) * 100);
  };
  const lrBig = ratio(L, R), tbBig = ratio(Tt, Bb);
  return {
    measured: true,
    source,
    inner,
    bordersPct: {
      l: +(L * 100).toFixed(1),
      r: +(R * 100).toFixed(1),
      t: +(Tt * 100).toFixed(1),
      b: +(Bb * 100).toFixed(1),
    },
    lr: `${L >= R ? lrBig : 100 - lrBig}L/${L >= R ? 100 - lrBig : lrBig}R`,
    tb: `${Tt >= Bb ? tbBig : 100 - tbBig}T/${Tt >= Bb ? 100 - tbBig : tbBig}B`,
    worst: Math.max(lrBig, tbBig),
  };
}
