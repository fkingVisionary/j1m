// Relief/emboss convolution + canvas utilities + the composite builders that feed the
// vision calls. Canvas-factory-injected so this runs in the browser and headless.
// Ported verbatim from the prototype.

import { lumOf, type Canvas2D, type CanvasFactory } from "@j1m/cv";

export interface Box {
  u: number;
  v: number;
  w: number;
  h: number;
}

export interface CropPair {
  color: string;
  relief: string;
}

// Emboss/relief filter — mimics TAG's "Card Vision": surfaces physical texture while
// suppressing printed art. Mutates and returns the canvas.
export function embossInPlace(canvas: Canvas2D, strength = 0.9): Canvas2D {
  const w = canvas.width, h = canvas.height, ctx = canvas.getContext("2d");
  const g = lumOf(ctx.getImageData(0, 0, w, h));
  const out = ctx.createImageData(w, h);
  const k = [-2, -1, 0, -1, 1, 1, 0, 1, 2];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, ki = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++, ki++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          s += k[ki] * g[yy * w + xx];
        }
      let v = 128 + s * strength;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      const p = (y * w + x) * 4;
      out.data[p] = out.data[p + 1] = out.data[p + 2] = v;
      out.data[p + 3] = 255;
    }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

export function cloneCanvas(cf: CanvasFactory, c: Canvas2D, maxDim?: number): Canvas2D {
  const s = maxDim ? Math.min(1, maxDim / Math.max(c.width, c.height)) : 1;
  const n = cf.createCanvas(Math.round(c.width * s), Math.round(c.height * s));
  n.getContext("2d").drawImage(c, 0, 0, n.width, n.height);
  return n;
}

export const toJpg = (c: Canvas2D, q = 0.86): string => c.toDataURL("image/jpeg", q);

export function cropRegion(
  cf: CanvasFactory,
  rect: Canvas2D,
  cx: number,
  cy: number,
  size: number,
  outSize = 200
): Canvas2D {
  const c = cf.createCanvas(outSize, outSize);
  c.getContext("2d").drawImage(
    rect,
    Math.max(0, Math.min(rect.width - size, cx - size / 2)),
    Math.max(0, Math.min(rect.height - size, cy - size / 2)),
    size, size, 0, 0, outSize, outSize
  );
  return c;
}

export function dingCropPair(cf: CanvasFactory, rect: Canvas2D, d: Box): CropPair {
  const cx = ((d.u + d.w / 2) / 100) * rect.width;
  const cy = ((d.v + d.h / 2) / 100) * rect.height;
  const size = Math.min(Math.max((Math.max(d.w, d.h) / 100) * rect.width * 2.6, 150), 700);
  return {
    color: toJpg(cropRegion(cf, rect, cx, cy, size, 180)),
    relief: toJpg(embossInPlace(cropRegion(cf, rect, cx, cy, size, 180))),
  };
}

export function cornerComposite(cf: CanvasFactory, rect: Canvas2D): Canvas2D {
  const S = Math.round(rect.width * 0.2), cell = 340;
  const out = cf.createCanvas(cell * 2, cell * 2);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, out.width, out.height);
  const cells: [string, number, number, number, number][] = [
    ["TL", 0, 0, 0, 0],
    ["TR", rect.width - S, 0, cell, 0],
    ["BL", 0, rect.height - S, 0, cell],
    ["BR", rect.width - S, rect.height - S, cell, cell],
  ];
  cells.forEach(([lbl, sx, sy, dx, dy]) => {
    ctx.drawImage(rect, sx, sy, S, S, dx + 4, dy + 4, cell - 8, cell - 8);
    ctx.fillStyle = "#000";
    ctx.fillRect(dx + 4, dy + 4, 54, 24);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px monospace";
    ctx.fillText(lbl, dx + 12, dy + 21);
  });
  return out;
}

export function edgeComposite(cf: CanvasFactory, rect: Canvas2D): Canvas2D {
  const D = Math.round(rect.width * 0.07);
  const out = cf.createCanvas(960, 4 * 124);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, out.width, out.height);
  const rows: [string, number, number, number, number][] = [
    ["TOP", 0, 0, rect.width, D],
    ["BOTTOM", 0, rect.height - D, rect.width, D],
    ["LEFT", 0, 0, D, rect.height],
    ["RIGHT", rect.width - D, 0, D, rect.height],
  ];
  rows.forEach(([lbl, sx, sy, sw, sh], i) => {
    const y = i * 124;
    if (sw > sh) ctx.drawImage(rect, sx, sy, sw, sh, 74, y + 8, 880, 108);
    else {
      const tmp = cf.createCanvas(sh, sw);
      const tctx = tmp.getContext("2d");
      tctx.translate(sh / 2, sw / 2);
      tctx.rotate(-Math.PI / 2);
      tctx.drawImage(rect, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
      ctx.drawImage(tmp, 74, y + 8, 880, 108);
    }
    ctx.fillStyle = "#000";
    ctx.fillRect(0, y + 8, 70, 24);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px monospace";
    ctx.fillText(lbl, 6, y + 25);
  });
  return out;
}

export function segOf(
  cf: CanvasFactory,
  rect: Canvas2D,
  col: number,
  row: number,
  cols: number,
  rows: number
): Canvas2D {
  const tw = Math.floor(rect.width / cols), thh = Math.floor(rect.height / rows);
  const c = cf.createCanvas(tw, thh);
  c.getContext("2d").drawImage(rect, col * tw, row * thh, tw, thh, 0, 0, tw, thh);
  return c;
}

export function verifyComposite(cf: CanvasFactory, rect: Canvas2D, cands: Box[]): Canvas2D {
  const n = cands.length, cell = 210;
  const out = cf.createCanvas(60 + cell * 2, n * (cell + 14));
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, out.width, out.height);
  cands.forEach((d, i) => {
    const cx = ((d.u + d.w / 2) / 100) * rect.width;
    const cy = ((d.v + d.h / 2) / 100) * rect.height;
    const size = Math.min(Math.max((Math.max(d.w, d.h) / 100) * rect.width * 2.4, 170), 760);
    const col = cropRegion(cf, rect, cx, cy, size, cell);
    const rel = embossInPlace(cropRegion(cf, rect, cx, cy, size, cell));
    const y = i * (cell + 14) + 7;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px monospace";
    ctx.fillText(`#${i + 1}`, 8, y + cell / 2);
    ctx.drawImage(col, 56, y);
    ctx.drawImage(rel, 56 + cell + 4, y);
  });
  return out;
}
