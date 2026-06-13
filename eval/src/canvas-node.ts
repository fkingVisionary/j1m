// Node CanvasFactory binding (@napi-rs/canvas). Lets the identical @j1m/cv + @j1m/relief
// engine run headless. Determinism note: napi canvas decoding may differ slightly from a
// browser; eval determinism is therefore pinned to the Node runtime (same fixtures, same
// binding, same result every run).

import { createCanvas as napiCreate, loadImage as napiLoad } from "@napi-rs/canvas";
import type { Canvas2D, CanvasFactory, ImageLike } from "@j1m/cv";

export const nodeCanvasFactory: CanvasFactory = {
  createCanvas(width: number, height: number): Canvas2D {
    return napiCreate(width, height) as unknown as Canvas2D;
  },
  async loadImage(src: string): Promise<ImageLike> {
    if (src.startsWith("data:")) {
      const b64 = src.slice(src.indexOf(",") + 1);
      const img = await napiLoad(Buffer.from(b64, "base64"));
      return img as unknown as ImageLike;
    }
    const img = await napiLoad(src);
    return img as unknown as ImageLike;
  },
};
