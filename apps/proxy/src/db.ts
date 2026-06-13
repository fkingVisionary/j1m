// SQLite via node:sqlite (no native build step). Two tables:
//  - response_cache: keyed by request hash; re-running eval never re-bills the API and
//    the rows double as eval fixtures.
//  - request_log: every call (hit or miss) — the future calibration/training corpus
//    and the debugging trail. Capturing it from the first call is free leverage.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DB_PATH } from "./config.js";

export function openDb(path: string = DB_PATH): DatabaseSync {
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
    CREATE TABLE IF NOT EXISTS request_log (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      ts             TEXT NOT NULL,
      image_hash     TEXT NOT NULL,
      prompt         TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      model          TEXT NOT NULL,
      full_response  TEXT,
      latency_ms     INTEGER,
      cost_usd       REAL,
      cached         INTEGER NOT NULL DEFAULT 0,
      ok             INTEGER NOT NULL DEFAULT 1,
      error          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_log_ts ON request_log(ts);
  `);
  return db;
}
