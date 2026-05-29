import type { FeedbackEvent, Weight } from "../types.js";

const SOURCE: Record<FeedbackEvent["source"], number> = { human: 1.0, agent: 0.3 };
const DIR: Record<FeedbackEvent["verdict"], number> = {
  accept: +1, confirm: +1, reject: -1, wontfix: -1, dismiss: -0.5,
};

export interface ReduceOpts {
  asOf: number; // explicit time anchor — NEVER Date.now() (§3.3 determinism)
  configVersion: string;
  halfLifeDays: number;
}

/**
 * T4 → T5 reducer (§3.3). PURE deterministic function of (events, asOf, configVersion,
 * halfLife). Weighted mean of direction (bounded ±1) + confidence (saturates with evidence).
 */
export function reduceWeight(
  events: FeedbackEvent[], fingerprint: string, ruleId: string, opts: ReduceOpts,
): Weight {
  let num = 0, den = 0, last = 0;
  for (const e of events) {
    const ageDays = (opts.asOf - e.createdAt) / 86_400_000;
    const decay = Math.pow(0.5, ageDays / opts.halfLifeDays);
    const w = (e.weightHint ?? 1) * SOURCE[e.source] * decay;
    num += DIR[e.verdict] * w;
    den += w;
    if (e.createdAt > last) last = e.createdAt;
  }
  const value = den === 0 ? 0 : clamp(num / den, -1, 1);
  const confidence = 1 - Math.exp(-den);
  return { fingerprint, ruleId, value, confidence, eventCount: events.length, lastEvent: last };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
