import { z } from "zod";
import type { Severity } from "../types.js";

export const ConfigSchema = z.object({
  configVersion: z.string().default("1"),
  shared: z.object({
    // Defaults calibrated to the MVP deterministic feature-hash embedding (256-dim), whose
    // cosine spread is ~0.81 for genuinely-similar components and ~0.01 for unrelated ones —
    // 0.75 cleanly bisects that gap. Re-derive minCosine + minPropOverlap together when a
    // learned embedding model replaces the feature-hash one (§2.6 re-embed migration).
    minCosine: z.number().min(0).max(1).default(0.75),
    minPropOverlap: z.number().min(0).max(1).default(0.40),
    minHookOverlap: z.number().min(0).max(1).default(0.70),
    minInstances: z.number().int().min(2).default(3),
    maxVariance: z.number().int().min(0).default(6),
    minFpCardinality: z.number().int().min(1).default(3),
    outlierFreq: z.number().min(0).max(1).default(0.5),
    warnAtInstances: z.number().int().default(3),
    errorAtInstances: z.number().int().default(5),
  }).default({}),
  reconcile: z.object({
    tSame: z.number().min(0).max(1).default(0.95),
    tDiv: z.number().min(0).max(1).default(0.80),
    tEmbed: z.number().min(0).max(1).default(0.92),
    tRevalidate: z.number().min(0).max(1).default(0.40),
  }).default({}),
  memory: z.object({
    halfLifeDays: z.number().positive().default(180),
    suppressBelow: z.number().min(-1).max(1).default(-0.3),
    amplifyAbove: z.number().min(-1).max(1).default(0.3),
    minConf: z.number().min(0).max(1).default(0.4),
    severityMap: z.record(z.enum(["info", "warn", "error"]), z.enum(["info", "warn", "error"])).optional(),
  }).default({})
  .superRefine((m, ctx) => {
    const rank = { info: 0, warn: 1, error: 2 } as const;
    for (const [k, v] of Object.entries(m.severityMap ?? {})) {
      if (rank[v as Severity] > rank[k as Severity]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `severityMap may only clamp DOWN: ${k} -> ${v} raises severity`,
        });
      }
    }
  }),
  renderCoupling: z.object({
    maxFanIn: z.number().int().min(0).default(5),
    maxFanOut: z.number().int().min(0).default(7),
    maxDirectChildren: z.number().int().min(0).default(5),
    maxReachableDepth: z.number().int().min(0).default(4),
  }).strict().default({}),
  overAbstraction: z.object({
    maxProps: z.number().int().min(0).default(10),
    maxHooks: z.number().int().min(0).default(6),
    maxChildren: z.number().int().min(0).default(8),
    maxCompositionMarkers: z.number().int().min(0).default(2),
    maxConditionalBranches: z.number().int().min(0).default(5),
  }).strict().default({}),
  hookTopology: z.object({
    maxFanIn: z.number().int().min(0).default(5),
    maxFanOut: z.number().int().min(0).default(5),
    maxDirectDependencies: z.number().int().min(0).default(5),
    maxReachableDepth: z.number().int().min(0).default(3),
  }).strict().default({}),
  excludeGlobs: z.array(z.string()).default([
    "**/*.test.*", "**/*.stories.*", "**/shared/**", "**/ui/**", "**/components/common/**",
  ]),
  boundaries: z.array(z.object({
    from: z.string(),
    to: z.string(),
    kind: z.string().optional(),
    reason: z.string(),
  })).default([]),
});

export type RaiConfig = z.infer<typeof ConfigSchema>;
export type RaiConfigInput = z.input<typeof ConfigSchema>;
