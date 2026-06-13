// Headless orchestration of the full pre-grade pipeline (stages 1-8). Identical stage
// order, composites, dedupe, and scoring/fallback wiring as the v7 prototype `run()` —
// just lifted out of React so it runs in the browser AND in the eval harness.

import {
  autoQuad,
  canvasFrom,
  centeringFromInner,
  detectInnerFrame,
  rectify,
  FULL_QUAD,
  type Centering,
  type Quad,
} from "@j1m/cv";
import {
  cloneCanvas,
  cornerComposite,
  dingCropPair,
  edgeComposite,
  embossInPlace,
  segOf,
  toJpg,
  verifyComposite,
  type Box,
  type CropPair,
} from "@j1m/relief";
import {
  buildEngineFallback,
  clampScore1000,
  computeSubgrades,
  gradeFromBackCenteringTCG,
  gradeFromFrontCentering,
  isValidSynth,
  psaFrontCap,
  snapSynth,
  toHalf,
  type CornerScores,
  type EdgeScores,
  type Finding,
  type SynthResult,
} from "@j1m/scoring";
import {
  CORNER_PROMPT,
  EDGE_PROMPT,
  ID_PROMPT,
  LISTING_PROMPT,
  SCORE_PROMPT,
  SEGMENT_PROMPT,
  STRUCT_PROMPT,
  VERIFY_PROMPT,
} from "@j1m/prompts";
import type { AiClient, AiCallResult } from "./client.js";
import { ProvenanceBuilder } from "./provenance.js";
import type {
  CardId,
  PipelineDeps,
  PipelineInput,
  PipelineResult,
  SegScore,
  StageKey,
} from "./types.js";

const imgUrls = (...urls: (string | null | undefined)[]) => urls.filter((u): u is string => !!u);

export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<PipelineResult> {
  const { cf, ai, hooks } = deps;
  const prov = new ProvenanceBuilder(input.depth);
  const stage = (k: StageKey, s: "active" | "done" | "fail") => hooks?.onStage?.(k, s);

  // Wrap an AI call: render prompt, attach images, record provenance, return result.
  async function callAi(
    stageKey: StageKey,
    spec: { name: string; version: string; model?: string },
    text: string,
    images: string[]
  ): Promise<AiCallResult> {
    const res = await ai.call({ prompt: spec.name, version: spec.version, model: spec.model, text, images });
    prov.record({
      stage: stageKey,
      prompt: spec.name,
      version: spec.version,
      model: res.model,
      costUSD: res.costUSD,
      cached: res.cached,
      ok: res.ok,
    });
    return res;
  }

  // ---- Stage 1: local CV (deterministic, no API) ----
  stage("detect", "active");
  const frontImg = await cf.loadImage(input.front);
  const srcCanvas = canvasFrom(cf, frontImg, 2400);
  const quad: Quad = input.quad || autoQuad(canvasFrom(cf, frontImg, 1100)) || FULL_QUAD;
  const rect = rectify(cf, srcCanvas, quad);
  const innerSource = input.inner ? "manual" : "cv";
  const inner = input.inner || detectInnerFrame(rect);
  const centerFront = centeringFromInner(inner, innerSource);

  const reliefUrl = toJpg(embossInPlace(cloneCanvas(cf, rect, 900)));
  hooks?.onRelief?.(reliefUrl);

  let centerBack: Centering | null = null;
  let backUrl: string | null = null;
  let rakeUrl: string | null = null;
  if (input.back) {
    const imB = await cf.loadImage(input.back);
    backUrl = toJpg(canvasFrom(cf, imB, 900));
    const qB = autoQuad(canvasFrom(cf, imB, 1100)) || FULL_QUAD;
    const rectB = rectify(cf, canvasFrom(cf, imB, 2400), qB);
    centerBack = centeringFromInner(detectInnerFrame(rectB), "cv");
  }
  if (input.rake) rakeUrl = toJpg(canvasFrom(cf, await cf.loadImage(input.rake), 900));
  hooks?.onCentering?.(centerFront, centerBack);
  stage("detect", "done");

  const rectUrl = toJpg(cloneCanvas(cf, rect, 1000));
  const reliefFullUrl = toJpg(embossInPlace(cloneCanvas(cf, rect, 1000)));

  // ---- Stage 2: ID ----
  stage("id", "active");
  let cardId: CardId | null = null;
  {
    const r = await callAi("id", ID_PROMPT, ID_PROMPT.build(), [rectUrl]);
    if (r.ok) { cardId = r.json as CardId; hooks?.onCardId?.(cardId); stage("id", "done"); }
    else stage("id", "fail");
  }
  const textured = !!(cardId && cardId.texturedFoil);

  // ---- Stage 3: corners ----
  stage("corners", "active");
  let corners: CornerScores | null = null;
  {
    const r = await callAi("corners", CORNER_PROMPT, CORNER_PROMPT.build(), [toJpg(cornerComposite(cf, rect))]);
    if (r.ok) { corners = r.json as CornerScores; hooks?.onCorners?.(corners); stage("corners", "done"); }
    else stage("corners", "fail");
  }

  // ---- Stage 4: edges ----
  stage("edges", "active");
  let edges: EdgeScores | null = null;
  {
    const r = await callAi("edges", EDGE_PROMPT, EDGE_PROMPT.build(), [toJpg(edgeComposite(cf, rect))]);
    if (r.ok) { edges = r.json as EdgeScores; hooks?.onEdges?.(edges); stage("edges", "done"); }
    else stage("edges", "fail");
  }

  // ---- Stage 5: surface deep sweep ----
  stage("surface", "active");
  const COLS = input.depth === "deep" ? 3 : 2;
  const ROWS = input.depth === "deep" ? 4 : 2;
  const total = COLS * ROWS;
  let cands: Finding[] = [];
  const segScores: SegScore[] = [];
  const rowName = ["TOP", "UPPER-MID", "LOWER-MID", "BOTTOM"];
  const colName = ["LEFT", "CENTER", "RIGHT"];
  let k = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      k++;
      const lbl =
        ROWS === 2
          ? `${row === 0 ? "TOP" : "BOTTOM"}-${col === 0 ? "LEFT" : "RIGHT"}`
          : `${rowName[row]} ${colName[Math.min(col, 2)]}`;
      try {
        const sc = segOf(cf, rect, col, row, COLS, ROWS);
        const colUrl = toJpg(cloneCanvas(cf, sc, 880));
        const relUrl = toJpg(embossInPlace(cloneCanvas(cf, sc, 880)));
        const r = await callAi("surface", SEGMENT_PROMPT, SEGMENT_PROMPT.build(lbl, textured), [colUrl, relUrl]);
        if (!r.ok) throw new Error(r.error || "segment call failed");
        const res = r.json as { cleanScore?: number; findings?: Finding[] };
        const cs = toHalf(res.cleanScore);
        segScores.push({ col, row, label: lbl, score: cs ?? 8 });
        (res.findings || []).slice(0, 2).forEach((f) => {
          cands.push({
            ...f,
            origin: "surface",
            u: (col + (f.u ?? 0) / 100) * (100 / COLS),
            v: (row + (f.v ?? 0) / 100) * (100 / ROWS),
            w: (f.w ?? 0) / COLS,
            h: (f.h ?? 0) / ROWS,
          });
        });
      } catch {
        segScores.push({ col, row, label: lbl, score: null });
      }
      hooks?.onSegment?.(`Inspecting segment ${k}/${total} — ${lbl}`, { cols: COLS, rows: ROWS, scores: [...segScores] });
    }
  }
  stage("surface", "done");

  // ---- Stage 6: structural ----
  stage("structural", "active");
  {
    try {
      const coarse = toJpg(embossInPlace(cloneCanvas(cf, rect, 430)));
      const parts = imgUrls(rectUrl, reliefFullUrl, coarse, backUrl, rakeUrl);
      const r = await callAi(
        "structural",
        STRUCT_PROMPT,
        STRUCT_PROMPT.build(textured, !!backUrl, !!rakeUrl),
        parts
      );
      if (!r.ok) throw new Error(r.error || "structural call failed");
      const res = r.json as { findings?: Finding[] };
      (res.findings || []).slice(0, 3).forEach((f) => cands.push({ ...f, origin: "structural" }));
      stage("structural", "done");
    } catch {
      stage("structural", "fail");
    }
  }

  // ---- dedupe + cap ----
  const iou = (a: Finding, b: Finding) => {
    const au = a.u ?? 0, av = a.v ?? 0, aw = a.w ?? 0, ah = a.h ?? 0;
    const bu = b.u ?? 0, bv = b.v ?? 0, bw = b.w ?? 0, bh = b.h ?? 0;
    const x0 = Math.max(au, bu), y0 = Math.max(av, bv);
    const x1 = Math.min(au + aw, bu + bw), y1 = Math.min(av + ah, bv + bh);
    const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    return inter / (aw * ah + bw * bh - inter || 1);
  };
  const dedup: Finding[] = [];
  cands.forEach((c) => { if (!dedup.some((d) => iou(c, d) > 0.35)) dedup.push(c); });
  cands = dedup.slice(0, 8);
  const pairsAll: CropPair[] = cands.map((d) => dingCropPair(cf, rect, d as Box));

  // ---- Stage 7: verification ----
  stage("verify", "active");
  let verified: Finding[] = [];
  let crops: CropPair[] = [];
  let rejected: Finding[] = [];
  let rejCrops: CropPair[] = [];
  if (cands.length) {
    const r = await callAi(
      "verify",
      VERIFY_PROMPT,
      VERIFY_PROMPT.build(cands.length, textured),
      [toJpg(verifyComposite(cf, rect, cands as Box[]))]
    );
    if (r.ok) {
      const vres = r.json as { verdicts?: { i: number; v: string; note?: string }[] };
      const map: Record<number, { i: number; v: string; note?: string }> = {};
      (vres.verdicts || []).forEach((v) => (map[v.i] = v));
      cands.forEach((c, i) => {
        const vv = map[i + 1] || { i: i + 1, v: "uncertain" };
        if (vv.v === "artwork") {
          rejected.push({ ...c, verdict: "artwork", vnote: vv.note || "texture/artwork" } as Finding);
          rejCrops.push(pairsAll[i]);
        } else {
          verified.push({ ...c, verdict: vv.v });
          crops.push(pairsAll[i]);
        }
      });
      stage("verify", "done");
    } else {
      verified = cands.map((c) => ({ ...c, verdict: "uncertain" }));
      crops = pairsAll;
      stage("verify", "fail");
    }
  } else {
    stage("verify", "done");
  }
  hooks?.onFindings?.(verified, crops, rejected, rejCrops);

  // ---- Stage 8: scoring (+ listing) with deterministic fallback ----
  stage("synth", "active");
  const cGradeF = centerFront.measured ? gradeFromFrontCentering(centerFront.worst) : null;
  const cGradeB = centerBack && centerBack.measured ? gradeFromBackCenteringTCG(centerBack.worst) : null;
  // Worst (lowest) of whichever centering grades we actually measured. Critically, when
  // the FRONT can't be measured (e.g. a full-art with no inner print frame) but the BACK
  // can, fall back to the back grade instead of dropping centering entirely.
  const centeringCands = [cGradeF, cGradeB].filter((g): g is number => g != null);
  const centeringGrade = centeringCands.length ? Math.min(...centeringCands) : null;
  const segVals = segScores.map((s) => s.score).filter((n): n is number => n != null && isFinite(n) && n > 0);

  const payload = {
    card: cardId,
    texturedFoil: textured,
    centering: {
      front: centerFront.measured ? { lr: centerFront.lr, tb: centerFront.tb, worst: centerFront.worst } : null,
      back: centerBack && centerBack.measured ? { lr: centerBack.lr, tb: centerBack.tb, worst: centerBack.worst } : null,
      centeringGrade,
      psaFrontCap: centerFront.measured ? psaFrontCap(centerFront.worst) : null,
      measured: centerFront.measured,
      source: centerFront.source,
    },
    corners,
    edges,
    segmentScores: segScores.map((s) => ({ seg: s.label, score: s.score })),
    findings: verified.map((f, i) => ({
      i, type: f.type, severity: f.severity, loc: f.loc, verdict: f.verdict, origin: f.origin, onBack: !!f.onBack,
    })),
    backProvided: !!input.back,
    rakeShotProvided: !!input.rake,
  };

  const subgrades = computeSubgrades({ corners, edges, segVals, verified, centeringGrade });
  const psaCap = centerFront.measured ? psaFrontCap(centerFront.worst) : null;

  let synth: SynthResult | null = null;
  {
    const r = await callAi("synth", SCORE_PROMPT, SCORE_PROMPT.build(payload), []);
    if (r.ok) synth = snapSynth(r.json as SynthResult);
  }
  if (!isValidSynth(synth)) {
    synth = buildEngineFallback({ subgrades, psaCap });
  }
  synth = clampScore1000(synth);
  hooks?.onSynth?.(synth);

  // listing (separate, optional — failure does not gate the grade)
  {
    const listingPayload = {
      card: cardId,
      grade: synth.grade10,
      score1000: synth.score1000,
      centering: centerFront.measured ? `${centerFront.lr} ${centerFront.tb}` : null,
      highlights: verified.slice(0, 3).map((f) => f.type),
    };
    const r = await callAi("synth", LISTING_PROMPT, LISTING_PROMPT.build(listingPayload), []);
    if (r.ok) {
      const l = r.json as { listingTitle?: string; listingBlurb?: string };
      synth.listingTitle = l.listingTitle;
      synth.listingBlurb = l.listingBlurb;
      hooks?.onSynth?.(synth);
    }
  }
  stage("synth", "done");

  return {
    cardId,
    centerFront,
    centerBack,
    corners,
    edges,
    segGrid: { cols: COLS, rows: ROWS, scores: segScores },
    findings: verified,
    rejected,
    crops,
    rejCrops,
    reliefUrl,
    synth,
    provenance: prov.build(),
    rect,
    quad,
  };
}
