import type { Canvas2D, CanvasFactory, Quad, InnerFrame, Centering } from "@j1m/cv";
import type { CropPair } from "@j1m/relief";
import type { CornerScores, EdgeScores, Finding, SynthResult } from "@j1m/scoring";
import type { AiClient } from "./client.js";
import type { Provenance } from "./provenance.js";

export type Depth = "standard" | "deep";

export const STAGE_KEYS = [
  "detect",
  "id",
  "corners",
  "edges",
  "surface",
  "structural",
  "verify",
  "synth",
] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export type StageStatus = "active" | "done" | "fail";

export interface CardId {
  name?: string;
  set?: string;
  number?: string | number;
  holo?: boolean;
  frame?: string;
  texturedFoil?: boolean;
}

export interface SegScore {
  col: number;
  row: number;
  label: string;
  score: number | null;
}

export interface SegGrid {
  cols: number;
  rows: number;
  scores: SegScore[];
}

export interface PipelineInput {
  front: string; // normalized data URL (required)
  back?: string;
  rake?: string;
  depth: Depth;
  /** Manual front-quad override (from the Adjust-lines UI). */
  quad?: Quad | null;
  /** Manual front inner-frame override. */
  inner?: InnerFrame | null;
}

export interface PipelineHooks {
  onStage?: (key: StageKey, status: StageStatus) => void;
  onCentering?: (front: Centering, back: Centering | null) => void;
  onRelief?: (url: string) => void;
  onCardId?: (id: CardId | null) => void;
  onCorners?: (c: CornerScores | null) => void;
  onEdges?: (e: EdgeScores | null) => void;
  onSegment?: (note: string, grid: SegGrid) => void;
  onFindings?: (verified: Finding[], crops: CropPair[], rejected: Finding[], rejCrops: CropPair[]) => void;
  onSynth?: (synth: SynthResult) => void;
}

export interface PipelineDeps {
  cf: CanvasFactory;
  ai: AiClient;
  hooks?: PipelineHooks;
}

export interface PipelineResult {
  cardId: CardId | null;
  centerFront: Centering;
  centerBack: Centering | null;
  corners: CornerScores | null;
  edges: EdgeScores | null;
  segGrid: SegGrid | null;
  findings: Finding[];
  rejected: Finding[];
  crops: CropPair[];
  rejCrops: CropPair[];
  reliefUrl: string | null;
  synth: SynthResult;
  provenance: Provenance;
  /** Rectified front canvas (for slab generation + overlays in-process). */
  rect: Canvas2D;
  quad: Quad;
}
