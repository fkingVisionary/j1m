// Browser AiClient — every vision/scoring call goes through the proxy. The Anthropic key
// never touches the client; the proxy enforces temp 0, caching, caps, validation, logging.

import type { AiClient, AiCallRequest, AiCallResult } from "@j1m/pipeline";

const PROXY_URL = (import.meta.env.VITE_PROXY_URL as string | undefined) ?? "http://localhost:8787";

export const proxyClient: AiClient = {
  async call(req: AiCallRequest): Promise<AiCallResult> {
    try {
      const r = await fetch(`${PROXY_URL}/v1/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      const d = (await r.json()) as Partial<AiCallResult>;
      return {
        ok: !!d.ok,
        json: d.json ?? null,
        model: d.model ?? "",
        costUSD: d.costUSD ?? 0,
        cached: !!d.cached,
        error: d.error,
      };
    } catch (e) {
      return { ok: false, json: null, model: "", costUSD: 0, cached: false, error: (e as Error).message };
    }
  },
};
