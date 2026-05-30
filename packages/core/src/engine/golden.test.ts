import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb } from "../db/db.js";
import { analyzeRepo } from "./pipeline.js";
import { sharedExtraction } from "../analyzers/shared-extraction.js";
import { AnalyzerRegistry } from "../analyzers/registry.js";
import { FindingsStore } from "../memory/findings-store.js";
import { FeedbackStore } from "../memory/feedback-store.js";
import { DEFAULT_CONFIG } from "../config/resolve.js";
import { pass1 } from "../parse/pass1.js";
import { layeredFingerprint } from "../fingerprint/layered.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/core/src/engine -> repo root is four levels up
const FIX = join(__dirname, "../../../../fixtures");
const read = (p: string) => readFileSync(join(FIX, p), "utf8");

function setup() {
  const db = openDb(":memory:");
  const registry = new AnalyzerRegistry();
  registry.register(sharedExtraction);
  const findings = new FindingsStore(db);
  const feedback = new FeedbackStore(db, findings);
  return { db, registry, findings, feedback };
}

test("GOLDEN: duplicated-buttons corpus yields exactly one opportunity", () => {
  // NOTE: fixtures live under fixtures/duplication/ (NOT shared/) on purpose — the default
  // excludeGlobs skip **/shared/**, so a 'shared/' path would correctly be excluded.
  const files = ["LoginButton", "SignupBtn", "CtaButton"].map((n) => ({
    file: `features/buttons/${n}.tsx`, source: read(`duplication/buttons/${n}.tsx`),
  }));
  const { registry, findings, feedback } = setup();
  const res = analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "r", commitSha: "c", asOf: 0 });
  expect(res.presented.length).toBe(1);
  expect(res.presented[0]!.evidence.kind).toBe("shared-extraction");
});

test("GOLDEN identity: reformatting a component preserves its structural fingerprint", () => {
  const before = pass1("Widget.tsx", read("identity/reformat/before.tsx")).components[0]!;
  const after = pass1("Widget.tsx", read("identity/reformat/after.tsx")).components[0]!;
  expect(layeredFingerprint(before).structural).toBe(layeredFingerprint(after).structural);
});

test("DETERMINISM REPLAY: identical inputs -> byte-identical presented findings (sans ids)", () => {
  const files = ["LoginButton", "SignupBtn", "CtaButton"].map((n) => ({
    file: `features/buttons/${n}.tsx`, source: read(`duplication/buttons/${n}.tsx`),
  }));
  const run = () => {
    const { registry, findings, feedback } = setup();
    return analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "r", commitSha: "c", asOf: 0 })
      .presented.map((p) => JSON.stringify({ type: p.type, status: p.status, fp: p.fingerprint.structural, ev: p.evidence }));
  };
  expect(run()).toEqual(run());
});
