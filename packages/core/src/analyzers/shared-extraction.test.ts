import { expect, test } from "vitest";
import { sharedExtraction } from "./shared-extraction.js";
import type { AnalysisContext } from "./analyzer.js";
import type { ComponentNode } from "../types.js";
import { DEFAULT_CONFIG } from "../config/resolve.js";
import { EMBED_MODEL_VERSION } from "../similarity/embed.js";

function comp(name: string, props: string[], hooks: string[]): ComponentNode {
  return {
    id: name, name, file: name + ".tsx", kind: "fn", exportKind: "default",
    span: { file: name + ".tsx", start: 0, end: 1, kind: "component", astPath: "p" },
    propNames: props, hookCalls: hooks, childComponents: [], compositionMarkers: [], conditionalBranches: 0,
  };
}

function ctx(components: ComponentNode[], over: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    graph: { components, modules: [], edges: [] },
    memory: { weight: () => ({ fingerprint: "", ruleId: "", value: 0, confidence: 0, eventCount: 0, lastEvent: 0 }) } as any,
    config: DEFAULT_CONFIG,
    types: { typeOf: () => null },
    runId: "run", commitSha: "c", analysisVersion: 1, embeddingModelVersion: EMBED_MODEL_VERSION,
    ...over,
  };
}

test("fires on 3 similar components", () => {
  const cs = [
    comp("LoginButton", ["label", "onClick", "variant"], ["useTheme"]),
    comp("SignupBtn", ["label", "onClick", "size"], ["useTheme"]),
    comp("CtaButton", ["label", "onClick", "variant"], ["useTheme"]),
  ];
  const findings = sharedExtraction.analyze(ctx(cs));
  expect(findings.length).toBe(1);
  expect(findings[0]!.type).toBe("opportunity");
  expect(findings[0]!.evidence.kind).toBe("shared-extraction");
});

test("does NOT fire on 2 similar components (below minInstances)", () => {
  const cs = [
    comp("A", ["label", "onClick"], ["useTheme"]),
    comp("B", ["label", "onClick"], ["useTheme"]),
  ];
  expect(sharedExtraction.analyze(ctx(cs)).length).toBe(0);
});

test("does NOT fire on dissimilar components", () => {
  const cs = [
    comp("Button", ["label", "onClick"], ["useTheme"]),
    comp("Table", ["rows", "columns"], ["useTable"]),
    comp("Modal", ["open", "title"], ["useDialog"]),
  ];
  expect(sharedExtraction.analyze(ctx(cs)).length).toBe(0);
});

test("excludes components under shared/ or ui/ (already the abstraction)", () => {
  const cs = [
    { ...comp("Button", ["label", "onClick", "variant"], ["useTheme"]), file: "ui/Button.tsx" },
    { ...comp("Button2", ["label", "onClick", "variant"], ["useTheme"]), file: "ui/Button2.tsx" },
    { ...comp("Button3", ["label", "onClick", "variant"], ["useTheme"]), file: "ui/Button3.tsx" },
  ];
  expect(sharedExtraction.analyze(ctx(cs)).length).toBe(0);
});

test("evidence captures shared surface and variance points", () => {
  const cs = [
    comp("A", ["label", "onClick", "variant"], ["useTheme"]),
    comp("B", ["label", "onClick", "size"], ["useTheme"]),
    comp("C", ["label", "onClick", "variant"], ["useTheme"]),
  ];
  const f = sharedExtraction.analyze(ctx(cs))[0]!;
  expect(f.evidence.sharedSurface.sort()).toEqual(["label", "onClick"]);
  expect(f.evidence.variancePoints.sort()).toEqual(["size", "variant"]);
});

test("severity escalates with instance count", () => {
  const five = ["A", "B", "C", "D", "E"].map((n) => comp(n, ["label", "onClick", "variant"], ["useTheme"]));
  expect(sharedExtraction.analyze(ctx(five))[0]!.severityRaw).toBe("error");
});

test("is pure: same context -> deeply equal findings (ignoring ulid id)", () => {
  const cs = [
    comp("A", ["label", "onClick", "variant"], ["useTheme"]),
    comp("B", ["label", "onClick", "size"], ["useTheme"]),
    comp("C", ["label", "onClick", "variant"], ["useTheme"]),
  ];
  const f1 = sharedExtraction.analyze(ctx(cs)).map((f) => ({ ...f, id: "" }));
  const f2 = sharedExtraction.analyze(ctx(cs)).map((f) => ({ ...f, id: "" }));
  expect(f1).toEqual(f2);
});
