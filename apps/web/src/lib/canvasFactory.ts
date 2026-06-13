// Browser CanvasFactory binding — wraps the native DOM canvas so @j1m/cv and @j1m/relief
// run interactively in the UI exactly as they run headless in the eval.

import type { Canvas2D, CanvasFactory, ImageLike } from "@j1m/cv";

export const browserCanvasFactory: CanvasFactory = {
  createCanvas(width: number, height: number): Canvas2D {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c as unknown as Canvas2D;
  },
  loadImage(src: string): Promise<ImageLike> {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im as unknown as ImageLike);
      im.onerror = reject;
      im.src = src;
    });
  },
};
