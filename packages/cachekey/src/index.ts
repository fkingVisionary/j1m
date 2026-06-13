// Content-addressed cache key — single-sourced so the proxy (writer) and the eval
// harness (reader) always agree. Node-only (uses node:crypto); never imported by the
// browser bundle, which doesn't compute keys (the proxy does).

import { createHash } from "node:crypto";

export const DEFAULT_MODEL = process.env.J1M_MODEL ?? "claude-sonnet-4-6";

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Hash of the attached images only — recorded in the log for the calibration corpus. */
export function imageHash(images: string[]): string {
  return sha256(images.join(" "));
}

export interface KeyInput {
  prompt: string;
  version: string;
  model?: string;
  text: string;
  images: string[];
}

/**
 * The cache key. Identical request (resolved model + prompt version + rendered text +
 * images) ⇒ same key ⇒ cache hit ⇒ no re-bill, identical result. The default model is
 * resolved here so a request that omits `model` keys the same on both sides.
 */
export function requestKey(req: KeyInput): { requestHash: string; model: string; imageHash: string } {
  const model = req.model || DEFAULT_MODEL;
  const requestHash = sha256(
    JSON.stringify({ model, prompt: req.prompt, version: req.version, text: req.text, images: req.images })
  );
  return { requestHash, model, imageHash: imageHash(req.images) };
}
