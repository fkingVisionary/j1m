// Backend proxy — the API key never touches the client. Every call is rate-limited,
// spend-capped, cached, schema-validated, and logged. The browser hits POST /v1/call;
// the response shape matches @j1m/pipeline's AiCallResult.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { DAILY_SPEND_CAP_USD, MODEL, PORT } from "./config.js";
import { openDb } from "./db.js";
import { getCached, putCached } from "./cache.js";
import { logCall } from "./log.js";
import { allowRequest } from "./ratelimit.js";
import { spentToday, underCap } from "./spendcap.js";
import { callAnthropic } from "./anthropic.js";
import { validateResponse } from "./validate.js";
import { requestKey } from "@j1m/cachekey";

const db = openDb();
const apiKey = process.env.ANTHROPIC_API_KEY || "";

const app = new Hono();
app.use("*", cors());

app.get("/health", (c) =>
  c.json({ ok: true, model: MODEL, hasKey: !!apiKey, spentToday: spentToday(db), capUSD: DAILY_SPEND_CAP_USD })
);

app.get("/v1/usage", (c) => c.json({ spentToday: spentToday(db), capUSD: DAILY_SPEND_CAP_USD }));

interface CallBody {
  prompt: string;
  version: string;
  model?: string;
  text: string;
  images?: string[];
}

app.post("/v1/call", async (c) => {
  let body: CallBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, json: null, model: MODEL, costUSD: 0, cached: false, error: "bad JSON body" }, 400);
  }
  const { prompt, version, text } = body;
  const images = body.images ?? [];
  if (!prompt || !version || typeof text !== "string") {
    return c.json(
      { ok: false, json: null, model: MODEL, costUSD: 0, cached: false, error: "missing prompt/version/text" },
      400
    );
  }

  const { requestHash: reqHash, model, imageHash: imgHash } = requestKey({
    prompt, version, model: body.model, text, images,
  });

  // --- cache hit: no bill, no model call ---
  const cached = getCached(db, reqHash);
  if (cached) {
    const v = validateResponse(prompt, cached.raw_response);
    logCall(db, {
      image_hash: imgHash, prompt, prompt_version: version, model: cached.model,
      full_response: cached.raw_response, latency_ms: 0, cost_usd: 0, cached: true, ok: v.ok, error: v.error,
    });
    return c.json({ ok: v.ok, json: v.json, model: cached.model, costUSD: 0, cached: true, error: v.error });
  }

  // --- cache miss: enforce throttle + circuit breaker before spending ---
  if (!allowRequest()) {
    return c.json({ ok: false, json: null, model, costUSD: 0, cached: false, error: "rate limit exceeded" }, 429);
  }
  if (!underCap(db)) {
    return c.json(
      { ok: false, json: null, model, costUSD: 0, cached: false, error: "daily spend cap reached" },
      429
    );
  }
  if (!apiKey) {
    return c.json(
      { ok: false, json: null, model, costUSD: 0, cached: false, error: "cache miss and no ANTHROPIC_API_KEY configured" },
      503
    );
  }

  const t0 = Date.now();
  try {
    const r = await callAnthropic({ apiKey, model: body.model, text, images });
    const latency = Date.now() - t0;
    putCached(db, {
      request_hash: reqHash, prompt, prompt_version: version, model: r.model, image_hash: imgHash,
      raw_response: r.text, input_tokens: r.inputTokens, output_tokens: r.outputTokens, cost_usd: r.costUSD,
    });
    const v = validateResponse(prompt, r.text);
    logCall(db, {
      image_hash: imgHash, prompt, prompt_version: version, model: r.model,
      full_response: r.text, latency_ms: latency, cost_usd: r.costUSD, cached: false, ok: v.ok, error: v.error,
    });
    return c.json({ ok: v.ok, json: v.json, model: r.model, costUSD: r.costUSD, cached: false, error: v.error });
  } catch (e) {
    const latency = Date.now() - t0;
    const msg = (e as Error).message;
    logCall(db, {
      image_hash: imgHash, prompt, prompt_version: version, model,
      full_response: null, latency_ms: latency, cost_usd: 0, cached: false, ok: false, error: msg,
    });
    return c.json({ ok: false, json: null, model, costUSD: 0, cached: false, error: msg }, 502);
  }
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`j1m proxy on :${info.port} — model ${MODEL}, daily cap $${DAILY_SPEND_CAP_USD}, key ${apiKey ? "set" : "MISSING"}`);
});

export { app };
