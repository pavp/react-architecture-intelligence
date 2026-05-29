import { z } from "zod";

export const ConfigSchema = z.object({
  configVersion: z.string().default("1"),
  shared: z.object({
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
  }).default({}),
  excludeGlobs: z.array(z.string()).default([
    "**/*.test.*", "**/*.stories.*", "**/shared/**", "**/ui/**", "**/components/common/**",
  ]),
});

export type RaiConfig = z.infer<typeof ConfigSchema>;
export type RaiConfigInput = z.input<typeof ConfigSchema>;
