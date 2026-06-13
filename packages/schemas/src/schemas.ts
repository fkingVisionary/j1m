// Structured-output enforcement. One zod schema per AI call. `parseOrRepair` first
// recovers JSON the lenient way the prototype did (strip code fences, slice to the
// outermost braces), then validates against the schema. A stray sentence of preamble
// is repaired away; genuinely malformed output is REJECTED so the caller can apply its
// deterministic fallback — the fallback never fires on mere preamble.

import { z } from "zod";

const scoreNote = z.object({
  score: z.coerce.number(),
  note: z.string().optional(),
});

const finding = z.object({
  loc: z.string().optional(),
  type: z.string().optional(),
  severity: z.string().optional(),
  u: z.coerce.number().optional(),
  v: z.coerce.number().optional(),
  w: z.coerce.number().optional(),
  h: z.coerce.number().optional(),
  note: z.string().optional(),
  onBack: z.boolean().optional(),
});

export const idSchema = z.object({
  name: z.string().optional(),
  set: z.string().optional(),
  number: z.union([z.string(), z.number()]).optional(),
  holo: z.boolean().optional(),
  frame: z.string().optional(),
  texturedFoil: z.boolean().optional(),
});

export const cornersSchema = z.object({
  tl: scoreNote.optional(),
  tr: scoreNote.optional(),
  bl: scoreNote.optional(),
  br: scoreNote.optional(),
});

export const edgesSchema = z.object({
  top: scoreNote.optional(),
  bottom: scoreNote.optional(),
  left: scoreNote.optional(),
  right: scoreNote.optional(),
});

export const segmentSchema = z.object({
  cleanScore: z.coerce.number().optional(),
  findings: z.array(finding).default([]),
});

export const structuralSchema = z.object({
  findings: z.array(finding).default([]),
});

export const verifySchema = z.object({
  verdicts: z
    .array(
      z.object({
        i: z.coerce.number(),
        v: z.enum(["damage", "artwork", "uncertain"]).catch("uncertain"),
        note: z.string().optional(),
      })
    )
    .default([]),
});

export const scoreSchema = z.object({
  grade10: z.coerce.number(),
  score1000: z.coerce.number().optional(),
  low: z.coerce.number().optional(),
  high: z.coerce.number().optional(),
  confidence: z.string().optional(),
  companyGrades: z
    .object({ psa: z.coerce.number().nullable().optional(), cgc: z.coerce.number().nullable().optional() })
    .optional(),
  subgrades: z
    .object({
      centering: z.coerce.number().nullable().optional(),
      corners: z.coerce.number().nullable().optional(),
      edges: z.coerce.number().nullable().optional(),
      surface: z.coerce.number().nullable().optional(),
    })
    .optional(),
  dingIdx: z.array(z.coerce.number()).default([]),
  blockers: z.array(z.string()).default([]),
  verdict: z.string().optional(),
});

export const listingSchema = z.object({
  listingTitle: z.string().optional(),
  listingBlurb: z.string().optional(),
});

export const SCHEMAS = {
  id: idSchema,
  corners: cornersSchema,
  edges: edgesSchema,
  segment: segmentSchema,
  structural: structuralSchema,
  verify: verifySchema,
  score: scoreSchema,
  listing: listingSchema,
} as const;

export type SchemaName = keyof typeof SCHEMAS;
