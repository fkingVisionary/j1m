// The pipeline talks to Claude only through this interface. The browser injects an
// implementation that POSTs to the proxy (key stays server-side); the eval injects one
// that reads the response cache (zero API calls, fully reproducible). Either way the
// pipeline receives schema-validated JSON.

export interface AiCallRequest {
  /** Prompt name from @j1m/prompts (also selects the validation schema). */
  prompt: string;
  /** Prompt version, recorded in provenance and the cache key. */
  version: string;
  /** Optional per-call model override; undefined => proxy default model. */
  model?: string;
  /** Fully rendered prompt text. */
  text: string;
  /** Ordered JPEG data URLs to attach (order is significant to the prompts). */
  images: string[];
}

export interface AiCallResult {
  ok: boolean;
  /** Schema-validated object, or null when the call failed/was rejected. */
  json: unknown;
  /** Model actually used. */
  model: string;
  costUSD: number;
  cached: boolean;
  error?: string;
}

export interface AiClient {
  call(req: AiCallRequest): Promise<AiCallResult>;
}
