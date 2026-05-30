import type { Finding } from "../types.js";
import type { OverlayConfig } from "../memory/overlay.js";
import { overlay } from "../memory/overlay.js";
import type { FindingsStore } from "../memory/findings-store.js";
import type { FeedbackStore } from "../memory/feedback-store.js";
import { reduceWeight } from "../memory/reducer.js";

export type CodemodGateRefusalReason =
  | "no-such-finding"
  | "conflict-non-opportunity"
  | "stale-finding"
  | "suppressed-by-memory";

export type CodemodGateResult =
  | { status: "bound"; finding: Finding }
  | { status: "refused"; reason: "no-such-finding" | "conflict-non-opportunity" | "suppressed-by-memory" }
  | { status: "refused"; reason: "stale-finding"; currentAnalysisVersion: number; findingAnalysisVersion: number };

export interface CodemodGateContext {
  ruleId: string;
  analysisVersion: number;
  findings: FindingsStore;
  feedback: FeedbackStore;
  memoryConfig: OverlayConfig;
}

export function mayExecuteCodemod(fingerprint: string, ctx: CodemodGateContext): CodemodGateResult {
  const finding = ctx.findings.currentVersion(fingerprint, ctx.ruleId);
  if (!finding) return { status: "refused", reason: "no-such-finding" };
  if (finding.type !== "opportunity") return { status: "refused", reason: "conflict-non-opportunity" };
  if (finding.analysisVersion !== ctx.analysisVersion) {
    return {
      status: "refused",
      reason: "stale-finding",
      currentAnalysisVersion: ctx.analysisVersion,
      findingAnalysisVersion: finding.analysisVersion,
    };
  }

  const events = ctx.feedback.eventsFor(fingerprint, ctx.ruleId);
  const asOf = events.at(-1)?.createdAt ?? 0;
  const weight = reduceWeight(events, fingerprint, ctx.ruleId, { asOf, configVersion: "codemod-gate", halfLifeDays: Number.POSITIVE_INFINITY });
  const presented = overlay(finding, weight, ctx.memoryConfig);
  if (presented.status === "suppressed") return { status: "refused", reason: "suppressed-by-memory" };
  return { status: "bound", finding };
}
