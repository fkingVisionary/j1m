// Eval harness — runs the FULL pipeline headless over the holdout set, reading every AI
// response from fixtures/cache.sqlite (zero API calls, reproducible). Reports the bar that
// every later roadmap item must clear: MAE on the 1000 scale, agreement-within-0.5-grade,
// per-subgrade error, and cost per grade — for the cheap ("quick"=standard) and deep paths.

import { runPipeline, type Depth } from "@j1m/pipeline";
import { nodeCanvasFactory } from "./canvas-node.js";
import { openCacheDb } from "./cachedb.js";
import { makeCacheClient } from "./cache-client.js";
import { CACHE_DB_PATH, fileToDataUrl, loadGroundTruth } from "./fixtures.js";
import { computeMetrics, formatReport, type Prediction } from "./metrics.js";

async function main() {
  const gt = loadGroundTruth();
  const db = openCacheDb(CACHE_DB_PATH);
  const ai = makeCacheClient(db);

  // "quick" maps to the existing 2x2 standard path (CV + every pass, fewer surface
  // segments); "deep" is the 3x4 sweep. Both are measured for accuracy AND cost.
  const tiers: { label: string; depth: Depth }[] = [
    { label: "QUICK (standard 2x2)", depth: "standard" },
    { label: "DEEP (3x4 sweep)", depth: "deep" },
  ];

  console.log(`J1m's Grading — eval harness`);
  console.log(`fixtures: ${gt.cards.length} cards · cache: ${CACHE_DB_PATH}\n`);

  for (const tier of tiers) {
    const preds: Prediction[] = [];
    for (const card of gt.cards) {
      const front = fileToDataUrl(card.front);
      const res = await runPipeline(
        { front, back: card.back && fileToDataUrl(card.back), rake: card.rake && fileToDataUrl(card.rake), depth: tier.depth },
        { cf: nodeCanvasFactory, ai }
      );
      preds.push({
        id: card.id,
        grade: res.synth.grade10,
        score1000: res.synth.score1000,
        subgrades: res.synth.subgrades,
        costUSD: res.provenance.costUSD,
      });
    }
    console.log(formatReport(tier.label, computeMetrics(preds, gt.cards)));
    console.log("");
  }

  if (ai.misses > 0) {
    console.warn(
      `WARNING: ${ai.misses} cache miss(es). Re-run \`npm run seed -w eval\` to (re)record fixtures, or record real responses via the proxy.`
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
