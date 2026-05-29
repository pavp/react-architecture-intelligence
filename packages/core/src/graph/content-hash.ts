import { createHash } from "node:crypto";

/** Stable content hash — the incremental cache key (§2.1). Pure: bytes in, hex out. */
export function contentHash(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}
