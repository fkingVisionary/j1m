// Simple in-process sliding-window rate limiter. A bug in a client retry loop should
// hit this wall long before it hits the wallet.

import { RATE_LIMIT_PER_MIN } from "./config.js";

const hits: number[] = [];

export function allowRequest(now = Date.now()): boolean {
  const cutoff = now - 60_000;
  while (hits.length && hits[0] < cutoff) hits.shift();
  if (hits.length >= RATE_LIMIT_PER_MIN) return false;
  hits.push(now);
  return true;
}
