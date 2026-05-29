import { createHash } from "node:crypto";
import type { ComponentNode } from "../types.js";

/** Embedding model version — part of schema identity (§2.6). Bumping = re-embed migration. */
export const EMBED_MODEL_VERSION = "feature-v1";

const DIM = 256;

/**
 * Deterministic feature-hash embedding (§ similarity). MVP uses a hashed bag-of-features
 * over structural tokens — no external model, fully reproducible. Same component ⇒ same vector.
 * The vector is L2-normalized so cosine is a plain dot product.
 */
export function embedComponent(c: ComponentNode): Float32Array {
  const v = new Float32Array(DIM);
  const add = (token: string, weight: number) => {
    const bucket = hashBucket(token);
    v[bucket] = (v[bucket] ?? 0) + weight;
  };
  for (const p of c.propNames) add("prop:" + p, 1);
  for (const hk of c.hookCalls) add("hook:" + hk, 1.5);
  for (const ch of c.childComponents) add("child:" + ch, 1);
  for (const m of c.compositionMarkers) add("marker:" + m, 0.5);
  add("cond:" + (c.conditionalBranches > 0 ? "y" : "n"), 0.25);
  return l2normalize(v);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot; // both are L2-normalized
}

function hashBucket(token: string): number {
  const hex = createHash("sha256").update(token).digest("hex").slice(0, 8);
  return parseInt(hex, 16) % DIM;
}

function l2normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  for (let i = 0; i < v.length; i++) v[i] = v[i]! / norm;
  return v;
}
