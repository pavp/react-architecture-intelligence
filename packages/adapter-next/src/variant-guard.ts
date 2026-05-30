import type { AnalysisDiagnostic } from "@rai/core";
import type { NextDetection, NextVariant } from "./detect.js";

export interface NextVariantGuardInput {
  detection: NextDetection;
  analyzerId: string;
  supportedVariants: readonly NextVariant[];
}

export type NextVariantGuardResult =
  | { status: "ok" }
  | { status: "skipped"; diagnostic: AnalysisDiagnostic };

export function guardNextVariant(input: NextVariantGuardInput): NextVariantGuardResult {
  if (input.supportedVariants.includes(input.detection.variant)) return { status: "ok" };
  const supportedVariants = [...input.supportedVariants];
  return {
    status: "skipped",
    diagnostic: {
      kind: "variant-mismatch",
      adapterId: "next",
      analyzerId: input.analyzerId,
      detectedVariant: input.detection.variant,
      supportedVariants,
      rootDir: input.detection.rootDir,
      message: `${input.analyzerId} supports ${supportedVariants.join(", ")}, detected ${input.detection.variant}`,
    },
  };
}
