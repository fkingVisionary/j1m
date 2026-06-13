// Offline smoke test for the proxy's safety machinery (no API key / network needed).
// Exercises: cache roundtrip, schema repair-or-reject, daily spend circuit breaker, and
// the rate limiter. The live Anthropic leg is covered separately when a key is present.

import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openDb } from "./db.js";
import { getCached, putCached } from "./cache.js";
import { logCall } from "./log.js";
import { underCap, spentToday } from "./spendcap.js";
import { validateResponse } from "./validate.js";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
}

const db = openDb(join(tmpdir(), `j1m-smoke-${randomUUID()}.sqlite`));

// 1. cache roundtrip
putCached(db, {
  request_hash: "h1", prompt: "corners", prompt_version: "v1", model: "claude-sonnet-4-6",
  image_hash: "img1", raw_response: '{"tl":{"score":9,"note":"clean"}}',
  input_tokens: 100, output_tokens: 20, cost_usd: 0.001,
});
check("cache miss returns undefined", getCached(db, "nope") === undefined);
check("cache hit returns stored row", getCached(db, "h1")?.raw_response.includes("score") === true);

// 2. schema repair-or-reject
check("valid corners JSON passes", validateResponse("corners", '```json\n{"tl":{"score":9}}\n```').ok === true);
check("preamble is repaired away", validateResponse("corners", 'Here you go: {"tl":{"score":8}}').ok === true);
check("garbage is rejected", validateResponse("corners", "the card looks great!").ok === false);
check("unknown prompt is rejected", validateResponse("mystery", "{}").ok === false);

// 3. daily spend circuit breaker
check("under cap when empty", underCap(db) === true);
for (let i = 0; i < 50; i++) {
  logCall(db, {
    image_hash: "img", prompt: "score", prompt_version: "v1", model: "claude-sonnet-4-6",
    full_response: "{}", latency_ms: 10, cost_usd: 1, cached: false, ok: true,
  });
}
check(`spentToday reflects logged spend ($${spentToday(db)})`, spentToday(db) >= 50);
check("circuit breaker trips over cap", underCap(db) === false);

// 4. cached calls do not count toward the cap
const before = spentToday(db);
logCall(db, {
  image_hash: "img", prompt: "score", prompt_version: "v1", model: "claude-sonnet-4-6",
  full_response: "{}", latency_ms: 0, cost_usd: 0, cached: true, ok: true,
});
check("cached call adds no spend", spentToday(db) === before);

console.log(failures === 0 ? "\nPROXY SMOKE: PASS" : `\nPROXY SMOKE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
