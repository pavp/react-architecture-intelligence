import { createHash } from "node:crypto";
import type { ComponentNode } from "../types.js";

/** The current fingerprint algorithm version. Persisted with findings (§7 schema evolution). */
export const FP_ALGO_VERSION = 1;

/**
 * Structural fingerprint (§2.3) — the PRIMARY recognition key.
 * Hash over exactly 5 components, all order-insensitive:
 *   prop NAME set · hook invocation set · JSX child component set ·
 *   composition markers · conditional-branch presence.
 * Excludes prop TYPES (Pass-1 only) and the implementation BODY.
 */
export function structuralFingerprint(c: ComponentNode): string {
  const parts = [
    "props:" + [...c.propNames].sort().join(","),
    "hooks:" + [...c.hookCalls].sort().join(","),
    "children:" + [...c.childComponents].sort().join(","),
    "markers:" + [...c.compositionMarkers].sort().join(","),
    "cond:" + (c.conditionalBranches > 0 ? "y" : "n"),
  ];
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}
