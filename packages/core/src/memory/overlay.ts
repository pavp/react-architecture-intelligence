import type { Finding, PresentedFinding, PresentedStatus, Severity, Weight } from "../types.js";

export interface OverlayConfig {
  suppressBelow: number;
  amplifyAbove: number;
  minConf: number;
  severityMap?: Partial<Record<Severity, Severity>> | undefined;
}

/** Read-time overlay (§3.4). PURE. Returns a derived view; NEVER mutates the finding. */
export function overlay(f: Finding, w: Weight | null, cfg: OverlayConfig): PresentedFinding {
  const severity: Severity = cfg.severityMap?.[f.severityRaw] ?? f.severityRaw;
  let status: PresentedStatus = "active";
  if (w && w.confidence >= cfg.minConf) {
    if (w.value <= cfg.suppressBelow) status = "suppressed";
    else if (w.value >= cfg.amplifyAbove) status = "amplified";
  }
  return { ...f, severity, status, weight: w };
}
