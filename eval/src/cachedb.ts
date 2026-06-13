// Opens the committed fixtures cache (fixtures/cache.sqlite). The eval reads from it; the
// seed script writes to it. Mirrors the proxy's response_cache schema so a row written by
// the live proxy is directly reusable as an eval fixture.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openCacheDb(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS response_cache (
      request_hash   TEXT PRIMARY KEY,
      prompt         TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      model          TEXT NOT NULL,
      image_hash     TEXT NOT NULL,
      raw_response   TEXT NOT NULL,
      input_tokens   INTEGER,
      output_tokens  INTEGER,
      cost_usd       REAL,
      created_at     TEXT NOT NULL
    );
  `);
  return db;
}
