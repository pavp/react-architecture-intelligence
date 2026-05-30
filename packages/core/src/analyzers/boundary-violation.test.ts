import { expect, test } from "vitest";
import { boundaryViolation } from "./boundary-violation.js";
import type { AnalysisContext } from "./analyzer.js";
import type { ComponentNode, GraphEdge, HookNode } from "../types.js";
import { DEFAULT_CONFIG, resolveConfig, type RaiConfig } from "../config/resolve.js";
import { EMBED_MODEL_VERSION } from "../similarity/embed.js";

function comp(id: string, file: string): ComponentNode {
  return {
    id,
    name: id,
    file,
    kind: "fn",
    exportKind: "named",
    span: { file, start: 0, end: 10, kind: "component", astPath: `module>decl[${id}]` },
    propNames: [],
    hookCalls: [],
    childComponents: [],
    compositionMarkers: [],
    conditionalBranches: 0,
  };
}

function hook(id: string, file: string): HookNode {
  return {
    id,
    name: id,
    file,
    exportKind: "named",
    span: { file, start: 0, end: 10, kind: "hook", astPath: `module>decl[${id}]` },
    hookCalls: [],
  };
}

function edge(srcId: string, dstId: string, kind: "renders" | "uses-hook"): GraphEdge {
  return { srcId, dstId, kind };
}

function ctx(components: ComponentNode[], hooks: HookNode[], edges: GraphEdge[], config: RaiConfig): AnalysisContext {
  return {
    graph: { components, hooks, modules: [], edges },
    memory: { weight: () => ({ fingerprint: "", ruleId: "", value: 0, confidence: 0, eventCount: 0, lastEvent: 0 }) } as any,
    config,
    types: { typeOf: () => null },
    runId: "run",
    commitSha: "sha",
    analysisVersion: 1,
    embeddingModelVersion: EMBED_MODEL_VERSION,
    boundaryRules: [],
  };
}

test("emits architectural-conflict for forbidden renders edge", () => {
  const page = comp("Page", "features/Page.tsx");
  const button = comp("Button", "ui/Button.tsx");
  const config = resolveConfig({ conventions: [{
    id: "no-feature-to-ui-render",
    edgeKind: "renders",
    from: { kind: "component", file: "features/**" },
    to: { kind: "component", file: "ui/**" },
    severity: "error",
    reason: "feature must not render ui internals",
  }] });

  const findings = boundaryViolation.analyze(ctx([page, button], [], [edge(page.id, button.id, "renders")], config));

  expect(findings).toHaveLength(1);
  expect(findings[0]!.type).toBe("architectural-conflict");
  expect(findings[0]!.severityRaw).toBe("error");
  expect(findings[0]!.evidence).toEqual({
    kind: "boundary-violation",
    convention: { id: "no-feature-to-ui-render", edgeKind: "renders", policy: "forbid", reason: "feature must not render ui internals" },
    edge: {
      kind: "renders",
      from: { id: "Page", kind: "component", name: "Page", file: "features/Page.tsx", span: page.span },
      to: { id: "Button", kind: "component", name: "Button", file: "ui/Button.tsx", span: button.span },
    },
  });
});

test("emits architectural-conflict for forbidden hook-to-hook uses-hook edge", () => {
  const checkout = hook("useCheckout", "features/checkout.ts");
  const cart = hook("useCart", "features/cart.ts");
  const config = resolveConfig({ conventions: [{
    id: "no-checkout-to-cart-hook",
    edgeKind: "uses-hook",
    from: { kind: "hook", name: "useCheckout" },
    to: { kind: "hook", name: "useCart" },
    reason: "checkout hook must not depend on cart hook directly",
  }] });

  const findings = boundaryViolation.analyze(ctx([], [checkout, cart], [edge(checkout.id, cart.id, "uses-hook")], config));

  expect(findings).toHaveLength(1);
  expect(findings[0]!.type).toBe("architectural-conflict");
  expect((findings[0]!.evidence as any).edge.from.kind).toBe("hook");
});

test("matches component-to-hook uses-hook conventions", () => {
  const page = comp("CheckoutPage", "features/checkout/Page.tsx");
  const cart = hook("useCart", "features/cart.ts");
  const config = resolveConfig({ conventions: [{
    id: "no-component-cart-hook",
    edgeKind: "uses-hook",
    from: { kind: "component", file: "features/checkout/**" },
    to: { kind: "hook", name: "useCart" },
    reason: "checkout components must use checkout facade hooks",
  }] });

  const findings = boundaryViolation.analyze(ctx([page], [cart], [edge(page.id, cart.id, "uses-hook")], config));

  expect(findings).toHaveLength(1);
  expect((findings[0]!.evidence as any).edge.from.kind).toBe("component");
});

test("emits no findings when selectors do not match", () => {
  const page = comp("Page", "features/Page.tsx");
  const button = comp("Button", "ui/Button.tsx");
  const config = resolveConfig({ conventions: [{
    id: "no-admin-to-ui-render",
    edgeKind: "renders",
    from: { kind: "component", file: "admin/**" },
    to: { kind: "component", file: "ui/**" },
    reason: "admin rule only",
  }] });

  expect(boundaryViolation.analyze(ctx([page, button], [], [edge(page.id, button.id, "renders")], config))).toEqual([]);
});

test("sorts convention findings deterministically", () => {
  const a = comp("A", "features/A.tsx");
  const b = comp("B", "ui/B.tsx");
  const c = comp("C", "features/C.tsx");
  const config = resolveConfig({ conventions: [{
    id: "no-feature-to-ui-render",
    edgeKind: "renders",
    from: { kind: "component", file: "features/**" },
    to: { kind: "component", file: "ui/**" },
    reason: "feature must not render ui internals",
  }] });
  const first = boundaryViolation.analyze(ctx([a, b, c], [], [edge(a.id, b.id, "renders"), edge(c.id, b.id, "renders")], config)).map((finding) => ({ ...finding, id: "" }));
  const second = boundaryViolation.analyze(ctx([c, b, a], [], [edge(c.id, b.id, "renders"), edge(a.id, b.id, "renders")], config)).map((finding) => ({ ...finding, id: "" }));

  expect(first).toEqual(second);
  expect(first.map((finding) => finding.fingerprint.structural)).toEqual([...first.map((finding) => finding.fingerprint.structural)].sort());
});

test("emits no findings when no conventions are configured", () => {
  const page = comp("Page", "features/Page.tsx");
  const button = comp("Button", "ui/Button.tsx");

  expect(boundaryViolation.analyze(ctx([page, button], [], [edge(page.id, button.id, "renders")], DEFAULT_CONFIG))).toEqual([]);
});
