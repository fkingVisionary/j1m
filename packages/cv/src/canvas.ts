// Canvas abstraction — the CV engine never touches `document`, `Image`, or
// `ImageData` directly. A concrete CanvasFactory is injected: the browser binding
// wraps the native DOM canvas; the Node binding wraps @napi-rs/canvas. This is what
// lets the identical engine run interactively in the UI and headless in the eval.

export interface ImageDataLike {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface GradientLike {
  addColorStop(offset: number, color: string): void;
}

export interface ImageLike {
  width: number;
  height: number;
  naturalWidth?: number;
  naturalHeight?: number;
}

// Structural subset of CanvasRenderingContext2D actually used by the engine and the
// relief/slab utilities. Kept permissive on purpose so both bindings satisfy it.
export interface Ctx2D {
  fillStyle: string | GradientLike;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: "left" | "right" | "center" | "start" | "end";
  globalAlpha: number;

  getImageData(sx: number, sy: number, sw: number, sh: number): ImageDataLike;
  putImageData(data: ImageDataLike, dx: number, dy: number): void;
  createImageData(sw: number, sh: number): ImageDataLike;
  drawImage(image: unknown, ...args: number[]): void;

  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;

  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
}

export interface Canvas2D {
  width: number;
  height: number;
  getContext(type: "2d"): Ctx2D;
  toDataURL(type?: string, quality?: number): string;
}

export interface CanvasFactory {
  createCanvas(width: number, height: number): Canvas2D;
  loadImage(src: string): Promise<ImageLike>;
}
