import type { DatabaseSync } from "node:sqlite";

export interface CacheRow {
  request_hash: string;
  prompt: string;
  prompt_version: string;
  model: string;
  image_hash: string;
  raw_response: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export function getCached(db: DatabaseSync, requestHash: string): CacheRow | undefined {
  return db.prepare(`SELECT * FROM response_cache WHERE request_hash = ?`).get(requestHash) as
    | CacheRow
    | undefined;
}

export function putCached(db: DatabaseSync, row: CacheRow): void {
  db.prepare(
    `INSERT OR REPLACE INTO response_cache
       (request_hash, prompt, prompt_version, model, image_hash, raw_response,
        input_tokens, output_tokens, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.request_hash,
    row.prompt,
    row.prompt_version,
    row.model,
    row.image_hash,
    row.raw_response,
    row.input_tokens,
    row.output_tokens,
    row.cost_usd,
    new Date().toISOString()
  );
}
