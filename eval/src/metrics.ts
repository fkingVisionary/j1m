// Eval metrics. Per-subgrade error is broken out separately on purpose — centering,
// corners, edges, and surface fail for different reasons and a single aggregate hides
// regressions (the whole point of measuring before tuning).

import type { GroundTruthCard } from "./fixtures.js";

export interface Prediction {
  id: string;
  grade: number;
  score1000: number;
  subgrades: { centering: number | null; corners: number | null; edges: number | null; surface: number | null };
  costUSD: number;
}

export interface Metrics {
  n: number;
  mae1000: number;
  agreeWithinHalf: number; // fraction in [0,1]
  subgradeMae: { centering: number; corners: number; edges: number; surface: number };
  costPerGrade: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function subgradeMae(
  preds: Prediction[],
  gt: Map<string, GroundTruthCard>,
  key: "centering" | "corners" | "edges" | "surface"
): number {
  const errs: number[] = [];
  for (const p of preds) {
    const truth = gt.get(p.id);
    const pv = p.subgrades[key];
    if (truth && pv != null) errs.push(Math.abs(pv - truth.subgrades[key]));
  }
  return +mean(errs).toFixed(3);
}

export function computeMetrics(preds: Prediction[], gtCards: GroundTruthCard[]): Metrics {
  const gt = new Map(gtCards.map((c) => [c.id, c]));
  const matched = preds.filter((p) => gt.has(p.id));
  const score1000Err = matched.map((p) => Math.abs(p.score1000 - gt.get(p.id)!.score1000));
  const agree = matched.filter((p) => Math.abs(p.grade - gt.get(p.id)!.grade) <= 0.5);
  return {
    n: matched.length,
    mae1000: +mean(score1000Err).toFixed(2),
    agreeWithinHalf: matched.length ? +(agree.length / matched.length).toFixed(3) : 0,
    subgradeMae: {
      centering: subgradeMae(matched, gt, "centering"),
      corners: subgradeMae(matched, gt, "corners"),
      edges: subgradeMae(matched, gt, "edges"),
      surface: subgradeMae(matched, gt, "surface"),
    },
    costPerGrade: +mean(matched.map((p) => p.costUSD)).toFixed(5),
  };
}

export function formatReport(label: string, m: Metrics): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return [
    `── ${label} (n=${m.n}) ─────────────────────────────`,
    `  MAE (1000-pt scale)        : ${m.mae1000}`,
    `  Agreement within 0.5 grade : ${pct(m.agreeWithinHalf)}`,
    `  Sub-grade MAE  centering   : ${m.subgradeMae.centering}`,
    `                 corners     : ${m.subgradeMae.corners}`,
    `                 edges       : ${m.subgradeMae.edges}`,
    `                 surface     : ${m.subgradeMae.surface}`,
    `  Cost per grade (USD)       : $${m.costPerGrade.toFixed(5)}`,
  ].join("\n");
}
