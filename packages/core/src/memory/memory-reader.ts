import type { Db } from "../db/db.js";
import type { Weight } from "../types.js";
import { FeedbackStore } from "./feedback-store.js";
import { FindingsStore } from "./findings-store.js";
import { reduceWeight, type ReduceOpts } from "./reducer.js";

/** Read-only memory view handed to analyzers in AnalysisContext (§2.4). */
export class MemoryReader {
  constructor(
    private db: Db,
    private findings: FindingsStore,
    private feedback: FeedbackStore,
    private reduceOpts: ReduceOpts,
  ) {}

  /** Current weight for a fingerprint+rule, computed fresh from T4 (deterministic via asOf). */
  weight(fingerprint: string, ruleId: string): Weight {
    const events = this.feedback.eventsFor(fingerprint, ruleId);
    return reduceWeight(events, fingerprint, ruleId, this.reduceOpts);
  }
}
