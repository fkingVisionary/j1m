// Hard per-day spend cap (constraint #6). Sums today's actual (non-cached) spend from
// the request log and trips a circuit breaker. One runaway loop can't burn the budget
// overnight.

import type { DatabaseSync } from "node:sqlite";
import { DAILY_SPEND_CAP_USD } from "./config.js";

export function spentToday(db: DatabaseSync, now = new Date()): number {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const row = db
    .prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS total FROM request_log WHERE cached = 0 AND ts >= ?`)
    .get(dayStart) as { total: number } | undefined;
  return row?.total ?? 0;
}

export function underCap(db: DatabaseSync, now = new Date()): boolean {
  return spentToday(db, now) < DAILY_SPEND_CAP_USD;
}
