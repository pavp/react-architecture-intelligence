import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { ComponentNode, Fingerprint } from "../types.js";
import { structuralFingerprint } from "./structural.js";

const h = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Layered identity (§2.3): structural (primary) + nominal (tiebreaker) + positional (fallback). */
export function layeredFingerprint(c: ComponentNode): Fingerprint {
  return {
    structural: structuralFingerprint(c),
    nominal: h(`${c.name}|${basename(c.file)}`),
    positional: h(`${c.file}|${c.exportKind}|${c.name}`),
  };
}
