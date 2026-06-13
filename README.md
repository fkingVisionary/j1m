# J1m's Grading — AI trading-card pre-grader

A pre-grade **triage** tool (not an official grade): upload card photos → measured
centering + corners/edges/surface subgrades, a 1–10 grade and 1000-pt score, PSA/CGC/TAG
predictions, a defect map, a branded slab graphic, and an eBay listing draft. Every output
is an honest **range** with a confidence level.

This repo is the migration of the v7 single-file prototype into a maintainable monorepo
with a secure backend proxy, an evaluation harness, and a reproducible response cache.
**Grading behavior is unchanged** from the prototype — this pass split, wired, and
instrumented only (see `fixtures/snapshot.json` + the parity gate).

## Layout

```
packages/
  cv         deterministic CV: corner detection, rectify, inner-frame march, centering math
             (pure — no React, no network, no browser globals; canvas factory injected)
  relief     emboss/relief convolution, composites, crops, slab graphic
  scoring    TAG tables/ladders, value snapping, deterministic engine fallback
  prompts    versioned prompt constants + the TAG rubric (each call records prompt@version)
  schemas    zod schema per AI call + repair-or-reject
  imaging    input contract: max dims, formats, EXIF orientation, HEIC decode
  pipeline   headless orchestration of stages 1–8 (runs in browser AND Node)
  cachekey   content-addressed cache key, single-sourced for proxy + eval (node-only)
apps/
  web        Vite + React UI — calls the proxy only; key never reaches the client
  proxy      AI gateway: temp 0, single model config, rate limit, daily spend cap,
             schema validation, response cache, request logging
eval/        headless harness + metrics (MAE/1000, agreement-within-0.5, per-subgrade, cost)
fixtures/    holdout images, ground-truth grades, cached responses, parity snapshot
```

The CV engine and the pipeline are **isomorphic**: a `CanvasFactory` and an `AiClient` are
injected. The browser injects the DOM canvas + an HTTP client to the proxy; the eval
injects `@napi-rs/canvas` + a cache reader. Same code, reproducible everywhere.

## Quick start

```bash
npm install
npm run typecheck            # tsc --build across all packages

# backend proxy (needs a key for live calls; serves cache-only without one)
cp apps/proxy/.env.example apps/proxy/.env   # add ANTHROPIC_API_KEY
npm run dev:proxy

# web UI (talks to the proxy)
cp apps/web/.env.example apps/web/.env
npm run dev:web

# evaluation (offline, zero API calls)
npm run seed   -w eval       # (re)build the synthetic demo fixtures
npm run eval   -w eval       # MAE / agreement / per-subgrade / cost, quick vs deep
npm run parity -w eval       # determinism + no-regression gate
npm run smoke  -w apps/proxy # offline proxy safety checks
```

## Engineering non-negotiables (baked in from commit 1)

| # | Requirement | Where |
|---|-------------|-------|
| 1 | Temperature 0 on every call | `apps/proxy/src/config.ts` (`TEMPERATURE`) |
| 2 | Prompt versioning, recorded everywhere | `packages/prompts`, provenance, cache key |
| 3 | Response cache `hash(image)+prompt_version+model` | `packages/cachekey`, `apps/proxy/src/cache.ts` |
| 4 | Structured output validated, repaired-or-rejected | `packages/schemas`, `apps/proxy/src/validate.ts` |
| 5 | Single model config + per-call override + tracking | `config.ts` `MODEL`, `PromptSpec.model`, provenance |
| 6 | Hard daily spend cap + rate limit | `apps/proxy/src/{spendcap,ratelimit}.ts` |

Plus: centering is **measured** (CV), artwork/foil is never reported as damage (relief
verification pass), every number is snapped to the 0.5 scale, the deterministic engine
always yields a sane grade with no AI reply, and every grade carries **provenance**
(`pipeline / prompt / calibration` versions + cost) — see the UI's Provenance panel.

## Not in this pass (roadmap)

TAG ground-truth harvester, calibration layer (replaces the hardcoded ladder —
`calibrationVersion` is already wired as `hardcoded-v0`), anchor exemplars, hardware rig,
and the explicit ungradeable-input failure UX. Each later change must clear the eval bar.
