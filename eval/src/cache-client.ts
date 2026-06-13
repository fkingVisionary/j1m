// Cache-only AiClient for the eval harness. Reads pre-recorded responses from
// fixtures/cache.sqlite — zero API calls, fully reproducible. Applies the SAME schema
// validation the proxy applies, so the eval exercises the real validation path.
// costUSD reports the recorded per-call cost, so cost-per-grade reflects real spend.

import type { DatabaseSync } from "node:sqlite";
import type { AiClient, AiCallRequest, AiCallResult } from "@j1m/pipeline";
import { SCHEMAS, parseOrRepair, type SchemaName } from "@j1m/schemas";
import { requestKey, DEFAULT_MODEL } from "@j1m/cachekey";

interface Row {
  raw_response: string;
  model: string;
  cost_usd: number;
}

export function makeCacheClient(db: DatabaseSync): AiClient & { misses: number } {
  const stmt = db.prepare(
    `SELECT raw_response, model, cost_usd FROM response_cache WHERE request_hash = ?`
  );
  const client = {
    misses: 0,
    async call(req: AiCallRequest): Promise<AiCallResult> {
      const { requestHash } = requestKey(req);
      const row = stmt.get(requestHash) as Row | undefined;
      if (!row) {
        client.misses++;
        return {
          ok: false,
          json: null,
          model: req.model || DEFAULT_MODEL,
          costUSD: 0,
          cached: true,
          error: `cache miss for ${req.prompt}@${req.version}`,
        };
      }
      const schema = SCHEMAS[req.prompt as SchemaName];
      const r = schema
        ? parseOrRepair(row.raw_response, schema)
        : ({ ok: false, error: "no schema" } as const);
      return {
        ok: r.ok,
        json: r.ok ? r.data : null,
        model: row.model,
        costUSD: row.cost_usd ?? 0,
        cached: true,
        error: r.ok ? undefined : (r as { error: string }).error,
      };
    },
  };
  return client;
}
