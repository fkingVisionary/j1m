// EXIF-aware image normalization for Node, mirroring the browser @j1m/imaging contract:
// apply EXIF orientation (phones lie about rotation and it silently breaks corner
// detection), cap the longest edge, output a canonical JPEG data URL. Every headless
// capture path (eval, probes) goes through this so it sees the same upright pixels the UI does.

import { readFileSync } from "node:fs";
import { loadImage as napiLoad } from "@napi-rs/canvas";
import { cloneCanvas, toJpg } from "@j1m/relief";
import { MAX_DIM, OUTPUT_QUALITY, readExifOrientation } from "@j1m/imaging";
import { nodeCanvasFactory as cf } from "./factory.js";
import type { Ctx2D } from "@j1m/cv";

export interface NormalizedNodeImage {
  dataUrl: string;
  width: number;
  height: number;
  exifOrientation: number;
}

// Maps EXIF orientation (1-8) to a context transform that draws the image upright.
function applyOrientation(ctx: Ctx2D, o: number, w: number, h: number): void {
  const t = (a: number, b: number, c: number, d: number, e: number, f: number) =>
    (ctx as unknown as { transform(a: number, b: number, c: number, d: number, e: number, f: number): void }).transform(a, b, c, d, e, f);
  switch (o) {
    case 2: t(-1, 0, 0, 1, w, 0); break;
    case 3: t(-1, 0, 0, -1, w, h); break;
    case 4: t(1, 0, 0, -1, 0, h); break;
    case 5: t(0, 1, 1, 0, 0, 0); break;
    case 6: t(0, 1, -1, 0, h, 0); break;
    case 7: t(0, -1, -1, 0, h, w); break;
    case 8: t(0, -1, 1, 0, 0, w); break;
    default: break; // 1 = no-op
  }
}

export async function loadNormalizedImage(path: string): Promise<NormalizedNodeImage> {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const exifOrientation = readExifOrientation(ab);
  const img = await napiLoad(buf);
  const iw = img.width, ih = img.height;
  const swap = exifOrientation >= 5 && exifOrientation <= 8;

  // Orient at full resolution, then downscale to the dimension cap.
  const oriented = cf.createCanvas(swap ? ih : iw, swap ? iw : ih);
  const octx = oriented.getContext("2d");
  applyOrientation(octx, exifOrientation, iw, ih);
  octx.drawImage(img, 0, 0);

  const capped = cloneCanvas(cf, oriented, MAX_DIM);
  return {
    dataUrl: toJpg(capped, OUTPUT_QUALITY),
    width: capped.width,
    height: capped.height,
    exifOrientation,
  };
}
