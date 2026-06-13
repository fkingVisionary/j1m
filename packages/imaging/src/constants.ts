// The image input contract, defined ONCE. Every capture path — phone upload and the
// future hardware rig — must funnel through normalizeImage so corner detection always
// sees correctly-oriented, bounded, decoded pixels.

export const MAX_DIM = 4096; // longest edge after normalization
export const OUTPUT_QUALITY = 0.92;
export const OUTPUT_TYPE = "image/jpeg";

// Formats we accept from the user. HEIC is included because iPhones default to it.
export const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const HEIC_MIME = ["image/heic", "image/heif"];

export function isHeic(file: { type?: string; name?: string }): boolean {
  if (file.type && HEIC_MIME.includes(file.type)) return true;
  return /\.hei[cf]$/i.test(file.name || "");
}
