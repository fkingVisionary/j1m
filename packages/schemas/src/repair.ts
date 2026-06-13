// JSON recovery + schema validation. The recovery step reproduces the prototype's
// `claude()` parsing exactly (strip ```json fences, slice from first { to last }).

import type { z } from "zod";

export interface RepairOk<T> {
  ok: true;
  data: T;
}
export interface RepairErr {
  ok: false;
  error: string;
}
export type RepairResult<T> = RepairOk<T> | RepairErr;

/** Recover a JSON object from raw model text the way the prototype did. */
export function extractJson(text: string): unknown {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no JSON object found in model output");
  }
  return JSON.parse(clean.slice(start, end + 1));
}

/** Recover then validate. Returns a discriminated result rather than throwing. */
export function parseOrRepair(text: string, schema: z.ZodTypeAny): RepairResult<unknown> {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (e) {
    return { ok: false, error: `unparseable: ${(e as Error).message}` };
  }
  const res = schema.safeParse(raw);
  if (!res.success) {
    return { ok: false, error: `schema: ${res.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}` };
  }
  return { ok: true, data: res.data };
}
