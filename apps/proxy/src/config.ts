// Single source of truth for model + money. Upgrading the model is one line here
// (constraint #5); the spend cap is a hard circuit breaker, not a nicety (#6).

export const MODEL = process.env.J1M_MODEL ?? "claude-sonnet-4-6";

export const ANTHROPIC_VERSION = "2023-06-01";
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const MAX_TOKENS = 1000;
export const TEMPERATURE = 0; // constraint #1 — every vision and scoring call

// USD per 1M tokens, keyed by model. Used to attribute cost per call/grade.
// Update alongside MODEL. Sonnet-tier pricing as of this build.
export const PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  "claude-sonnet-4-6": { inputPerM: 3, outputPerM: 15 },
  "claude-haiku-4-5-20251001": { inputPerM: 1, outputPerM: 5 },
};

export const DEFAULT_PRICING = { inputPerM: 3, outputPerM: 15 };

// Circuit breaker + throttle.
export const DAILY_SPEND_CAP_USD = Number(process.env.J1M_DAILY_CAP_USD ?? 10);
export const RATE_LIMIT_PER_MIN = Number(process.env.J1M_RATE_PER_MIN ?? 60);

export const PORT = Number(process.env.PORT ?? 8787);
export const DB_PATH = process.env.J1M_DB_PATH ?? new URL("../data/proxy.sqlite", import.meta.url).pathname;

export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? DEFAULT_PRICING;
  return +((inputTokens / 1e6) * p.inputPerM + (outputTokens / 1e6) * p.outputPerM).toFixed(6);
}
