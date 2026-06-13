// Fixture locations + ground-truth loading. The /fixtures directory is the reproducible
// offline record: holdout images, their ground-truth grades, and the cached AI responses.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = join(here, "..", "..", "fixtures");
export const CACHE_DB_PATH = join(FIXTURES_DIR, "cache.sqlite");
export const GROUND_TRUTH_PATH = join(FIXTURES_DIR, "ground-truth.json");

export interface GroundTruthCard {
  id: string;
  front: string; // path relative to FIXTURES_DIR
  back?: string;
  rake?: string;
  grade: number;
  score1000: number;
  subgrades: { centering: number; corners: number; edges: number; surface: number };
}

export interface GroundTruth {
  notes?: string;
  cards: GroundTruthCard[];
}

export function loadGroundTruth(): GroundTruth {
  return JSON.parse(readFileSync(GROUND_TRUTH_PATH, "utf8"));
}

/** Build the canonical input data URL from a fixture file — identical bytes on seed and
 *  eval, which keeps the response-cache keys stable. */
export function fileToDataUrl(relPath: string): string {
  const buf = readFileSync(join(FIXTURES_DIR, relPath));
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}
