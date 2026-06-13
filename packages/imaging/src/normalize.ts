// Browser image normalization. Output is a canonical, EXIF-corrected, size-capped JPEG
// data URL that every downstream stage (CV, relief, vision calls) can rely on.

import { MAX_DIM, OUTPUT_QUALITY, OUTPUT_TYPE, ACCEPTED_MIME, isHeic } from "./constants.js";
import { readExifOrientation } from "./exif.js";

export interface NormalizedImage {
  dataUrl: string;
  width: number;
  height: number;
  /** EXIF orientation found in the source (1 = normal), recorded for provenance/debug. */
  exifOrientation: number;
  /** Original MIME type, after any HEIC conversion is recorded as the source. */
  sourceType: string;
}

export class UnsupportedImageError extends Error {}

async function toDecodableBlob(file: File): Promise<{ blob: Blob; sourceType: string }> {
  if (isHeic(file)) {
    try {
      const { default: heic2any } = await import("heic2any");
      const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.95 });
      const blob = Array.isArray(out) ? out[0] : out;
      return { blob, sourceType: "image/heic" };
    } catch (e) {
      throw new UnsupportedImageError(
        "HEIC image could not be decoded. Install the optional `heic2any` dependency or upload a JPEG/PNG."
      );
    }
  }
  if (file.type && !ACCEPTED_MIME.includes(file.type as (typeof ACCEPTED_MIME)[number])) {
    throw new UnsupportedImageError(`Unsupported image type: ${file.type}`);
  }
  return { blob: file, sourceType: file.type || "image/jpeg" };
}

export async function normalizeImage(file: File): Promise<NormalizedImage> {
  const buf = await file.arrayBuffer();
  const exifOrientation = readExifOrientation(buf);
  const { blob, sourceType } = await toDecodableBlob(file);

  // `imageOrientation: "from-image"` makes the decoder bake EXIF rotation into pixels,
  // so the canvas — and therefore corner detection — sees an upright card.
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  return {
    dataUrl: canvas.toDataURL(OUTPUT_TYPE, OUTPUT_QUALITY),
    width: w,
    height: h,
    exifOrientation,
    sourceType,
  };
}
