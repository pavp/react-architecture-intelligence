import { cosine } from "./embed.js";

export interface VecItem { id: string; vec: Float32Array; }

/**
 * Greedy single-linkage clustering by cosine ≥ threshold (§4.2). Pure + deterministic
 * (stable input order ⇒ stable output). Returns all clusters incl. singletons.
 */
export function clusterByCosine<T extends VecItem>(items: T[], minCosine: number): T[][] {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (cosine(items[i]!.vec, items[j]!.vec) >= minCosine) union(i, j);
    }
  }

  const groups = new Map<number, T[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const g = groups.get(root) ?? [];
    g.push(items[i]!);
    groups.set(root, g);
  }
  return [...groups.values()];
}

/**
 * Min pairwise cosine within a cluster — the conservative similarity used by the predicate.
 * A cluster of < 2 has no pair, so return 0 (conservative — a singleton must never trivially
 * satisfy a `>=` similarity gate by looking maximally similar to itself).
 */
export function minClusterCosine(items: VecItem[]): number {
  if (items.length < 2) return 0;
  let min = 1;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      min = Math.min(min, cosine(items[i]!.vec, items[j]!.vec));
  return min;
}
