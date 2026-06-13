// Perspective-rectify the detected quad into the canonical card canvas via inverse
// bilinear sampling. Ported verbatim; `new ImageData` routed through the factory's ctx.

import type { Canvas2D, CanvasFactory } from "./canvas.js";
import type { Quad } from "./geometry.js";

export const RW = 1320;
export const RH = 1848;

export function rectify(cf: CanvasFactory, srcCanvas: Canvas2D, quad: Quad): Canvas2D {
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const src = srcCanvas.getContext("2d").getImageData(0, 0, sw, sh);

  const c = cf.createCanvas(RW, RH);
  const octx = c.getContext("2d");
  const out = octx.createImageData(RW, RH);

  const Q: Record<"tl" | "tr" | "br" | "bl", { x: number; y: number }> = {
    tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 },
  };
  (["tl", "tr", "br", "bl"] as const).forEach(
    (k) => (Q[k] = { x: (quad[k].x / 100) * sw, y: (quad[k].y / 100) * sh })
  );

  for (let yy = 0; yy < RH; yy++) {
    const v = yy / (RH - 1);
    for (let xx = 0; xx < RW; xx++) {
      const u = xx / (RW - 1);
      const tx = Q.tl.x + (Q.tr.x - Q.tl.x) * u, ty = Q.tl.y + (Q.tr.y - Q.tl.y) * u;
      const bx = Q.bl.x + (Q.br.x - Q.bl.x) * u, by = Q.bl.y + (Q.br.y - Q.bl.y) * u;
      let X = tx + (bx - tx) * v, Y = ty + (by - ty) * v;
      X = Math.max(0, Math.min(sw - 1.001, X));
      Y = Math.max(0, Math.min(sh - 1.001, Y));
      const x0 = X | 0, y0 = Y | 0, fx = X - x0, fy = Y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const o = (yy * RW + xx) * 4;
      for (let ch = 0; ch < 3; ch++) {
        out.data[o + ch] =
          src.data[i00 + ch] * (1 - fx) * (1 - fy) + src.data[i10 + ch] * fx * (1 - fy) +
          src.data[i01 + ch] * (1 - fx) * fy + src.data[i11 + ch] * fx * fy;
      }
      out.data[o + 3] = 255;
    }
  }
  octx.putImageData(out, 0, 0);
  return c;
}
