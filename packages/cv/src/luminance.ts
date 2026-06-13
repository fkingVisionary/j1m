// Luminance + gradient magnitude. Pure array math, no canvas dependency.
// Ported verbatim from the prototype.

import type { ImageDataLike } from "./canvas.js";

export function lumOf(idata: ImageDataLike): Float32Array {
  const { data, width: w, height: h } = idata;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return g;
}

export function gradMag(g: Float32Array, w: number, h: number): Float32Array {
  const m = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      m[i] = Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + w] - g[i - w]);
    }
  return m;
}
