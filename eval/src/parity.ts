// Reproducibility / behavior-parity gate. Runs the full pipeline headless from the cache
// and asserts the grade output is (a) identical across two runs of the same input
// (deterministic) and (b) unchanged versus the committed snapshot (no silent regression).
// This is the bar the migration had to clear: identical input ⇒ identical output.
//
// Usage:
//   npm run parity -w eval            # check against fixtures/snapshot.json
//   npm run parity -w eval -- --update  # (re)write the snapshot intentionally

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runPipeline, type Depth } from "@j1m/pipeline";
import { nodeCanvasFactory } from "./canvas-node.js";
import { openCacheDb } from "./cachedb.js";
import { makeCacheClient } from "./cache-client.js";
import { CACHE_DB_PATH, FIXTURES_DIR, fileToDataUrl, loadGroundTruth } from "./fixtures.js";

const SNAPSHOT_PATH = join(FIXTURES_DIR, "snapshot.json");

interface Snap {
  id: string;
  depth: Depth;
  grade10: number;
  score1000: number;
  subgrades: unknown;
  centering: string | null;
}

async function snapshot(): Promise<Snap[]> {
  const gt = loadGroundTruth();
  const db = openCacheDb(CACHE_DB_PATH);
  const ai = makeCacheClient(db);
  const out: Snap[] = [];
  for (const depth of ["standard", "deep"] as Depth[]) {
    for (const card of gt.cards) {
      const res = await runPipeline(
        { front: fileToDataUrl(card.front), depth },
        { cf: nodeCanvasFactory, ai }
      );
      out.push({
        id: card.id,
        depth,
        grade10: res.synth.grade10,
        score1000: res.synth.score1000,
        subgrades: res.synth.subgrades,
        centering: res.centerFront.measured ? `${res.centerFront.lr} ${res.centerFront.tb}` : null,
      });
    }
  }
  if (ai.misses > 0) throw new Error(`${ai.misses} cache miss(es) — run \`npm run seed -w eval\` first`);
  return out;
}

const update = process.argv.includes("--update");

const a = await snapshot();
const b = await snapshot();

// (a) determinism: two runs must be byte-identical.
if (JSON.stringify(a) !== JSON.stringify(b)) {
  console.error("✗ NON-DETERMINISTIC: two runs of the same input produced different output");
  process.exit(1);
}
console.log(`✓ deterministic across re-run (${a.length} grades)`);

// (b) no regression vs committed snapshot.
if (update || !existsSync(SNAPSHOT_PATH)) {
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(a, null, 2) + "\n");
  console.log(`✓ snapshot written to ${SNAPSHOT_PATH} (${a.length} grades)`);
  process.exit(0);
}

const committed = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
if (JSON.stringify(committed) !== JSON.stringify(a)) {
  console.error("✗ REGRESSION: output differs from committed snapshot. If intentional, re-run with --update.");
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(committed[i]) !== JSON.stringify(a[i])) {
      console.error(`  ${a[i].id}/${a[i].depth}: was ${JSON.stringify(committed[i])} now ${JSON.stringify(a[i])}`);
    }
  }
  process.exit(1);
}
console.log("✓ matches committed snapshot — no behavior change");
