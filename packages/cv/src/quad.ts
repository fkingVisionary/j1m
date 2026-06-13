// Card-finding: build a working canvas from an image, then locate the card's four
// corners by gradient edge detection + per-side least-squares line fitting.
// Ported verbatim from the prototype `canvasFrom` and `autoQuad`.

import type { Canvas2D, CanvasFactory, ImageLike } from "./canvas.js";
import type { Quad } from "./geometry.js";
import { lumOf, gradMag } from "./luminance.js";

export function canvasFrom(cf: CanvasFactory, img: ImageLike, maxDim: number): Canvas2D {
  const iw = img.naturalWidth ?? img.width;
  const ih = img.naturalHeight ?? img.height;
  const s = Math.min(1, maxDim / Math.max(iw, ih));
  const c = cf.createCanvas(Math.max(1, Math.round(iw * s)), Math.max(1, Math.round(ih * s)));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function autoQuad(canvas: Canvas2D): Quad | null {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext("2d");
  const g = lumOf(ctx.getImageData(0, 0, w, h));
  const m = gradMag(g, w, h);

  const firstEdge = (line: Float32Array, len: number) => {
    let mx = 0;
    for (let i = 0; i < len; i++) mx = Math.max(mx, line[i]);
    const th = Math.max(14, mx * 0.42);
    for (let i = 2; i < len - 3; i++)
      if (line[i] > th && (line[i + 1] > th * 0.5 || line[i + 2] > th * 0.5)) return i;
    return -1;
  };

  const fit = (pts: { t: number; p: number }[]) => {
    if (pts.length < 8) return null;
    const med = pts.map((q) => q.p).sort((a, b) => a - b)[Math.floor(pts.length / 2)];
    const span = Math.max(w, h);
    const inl = pts.filter((q) => Math.abs(q.p - med) < span * 0.035);
    if (inl.length < 8) return null;
    let st = 0, sp = 0, stt = 0, stp = 0;
    const n = inl.length;
    inl.forEach(({ t, p }) => { st += t; sp += p; stt += t * t; stp += t * p; });
    const den = n * stt - st * st;
    if (Math.abs(den) < 1e-6) return { a: 0, b: sp / n };
    const a = (n * stp - st * sp) / den;
    return { a, b: (sp - a * st) / n };
  };

  const scanV = (fromLeft: boolean) => {
    const pts: { t: number; p: number }[] = [];
    for (let y = Math.round(h * 0.16); y < h * 0.84; y += 3) {
      const len = Math.round(w * 0.46), line = new Float32Array(len);
      for (let i = 0; i < len; i++) line[i] = m[y * w + (fromLeft ? i : w - 1 - i)];
      const e = firstEdge(line, len);
      if (e > 0) pts.push({ t: y, p: fromLeft ? e : w - 1 - e });
    }
    return fit(pts);
  };
  const scanH = (fromTop: boolean) => {
    const pts: { t: number; p: number }[] = [];
    for (let x = Math.round(w * 0.16); x < w * 0.84; x += 3) {
      const len = Math.round(h * 0.46), line = new Float32Array(len);
      for (let i = 0; i < len; i++) line[i] = m[(fromTop ? i : h - 1 - i) * w + x];
      const e = firstEdge(line, len);
      if (e > 0) pts.push({ t: x, p: fromTop ? e : h - 1 - e });
    }
    return fit(pts);
  };

  const L = scanV(true), R = scanV(false), Tp = scanH(true), B = scanH(false);
  if (!L || !R || !Tp || !B) return null;
  const ix = (v: { a: number; b: number }, hz: { a: number; b: number }) => {
    const y = (hz.a * v.b + hz.b) / (1 - hz.a * v.a);
    return { x: ((v.a * y + v.b) / w) * 100, y: (y / h) * 100 };
  };
  const q: Quad = { tl: ix(L, Tp), tr: ix(R, Tp), br: ix(R, B), bl: ix(L, B) };
  const ok = (p: { x: number; y: number }) => p.x > -5 && p.x < 105 && p.y > -5 && p.y < 105;
  if (![q.tl, q.tr, q.br, q.bl].every(ok)) return null;
  if (Math.abs(q.tr.x - q.tl.x) < 18 || Math.abs(q.bl.y - q.tl.y) < 18) return null;
  return q;
}
