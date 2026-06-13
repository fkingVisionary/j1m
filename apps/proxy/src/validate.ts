// Server-side structured-output enforcement (constraint #4). Selects the schema by
// prompt name and runs the shared repair+validate. Repaired-or-rejected before the
// response ever reaches the client.

import { SCHEMAS, parseOrRepair, type SchemaName } from "@j1m/schemas";

export function validateResponse(prompt: string, rawText: string): { ok: boolean; json: unknown; error?: string } {
  const schema = SCHEMAS[prompt as SchemaName];
  if (!schema) {
    // No schema registered for this prompt name — treat as a rejection rather than
    // silently passing unvalidated output through.
    return { ok: false, json: null, error: `no schema for prompt "${prompt}"` };
  }
  const r = parseOrRepair(rawText, schema);
  return r.ok ? { ok: true, json: r.data } : { ok: false, json: null, error: r.error };
}
