import type { DatabaseSync } from "node:sqlite";

export interface LogRow {
  image_hash: string;
  prompt: string;
  prompt_version: string;
  model: string;
  full_response: string | null;
  latency_ms: number;
  cost_usd: number;
  cached: boolean;
  ok: boolean;
  error?: string | null;
}

// Appends one row per call (hit or miss). This log IS the calibration/training corpus.
export function logCall(db: DatabaseSync, row: LogRow): void {
  db.prepare(
    `INSERT INTO request_log
       (ts, image_hash, prompt, prompt_version, model, full_response, latency_ms, cost_usd, cached, ok, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    new Date().toISOString(),
    row.image_hash,
    row.prompt,
    row.prompt_version,
    row.model,
    row.full_response,
    row.latency_ms,
    row.cost_usd,
    row.cached ? 1 : 0,
    row.ok ? 1 : 0,
    row.error ?? null
  );
}
