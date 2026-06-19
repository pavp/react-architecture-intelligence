import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { buildMcpServer } from "./server.js";
import { DEFAULT_CONFIG } from "../config/resolve.js";
import { AnalyzerRegistry } from "../analyzers/registry.js";
import type { ProposalBuilder, ProposalBuilderInput, PreviewProposal } from "../codemod/proposal.js";
import type { Finding } from "../types.js";

test("buildMcpServer returns a server with the expected tool names registered", () => {
  const { toolNames } = buildMcpServer({ config: DEFAULT_CONFIG, rootDir: process.cwd() });
  for (const t of ["analyze_repo", "find_shared_opportunities", "explain_finding", "record_feedback", "close_session"]) {
    expect(toolNames).toContain(t);
  }
});

test("get_drift is listed in toolNames", () => {
  const { toolNames } = buildMcpServer({ config: DEFAULT_CONFIG, rootDir: process.cwd() });
  expect(toolNames).toContain("get_drift");
});

test("query_architecture is listed in toolNames", () => {
  const { toolNames } = buildMcpServer({ config: DEFAULT_CONFIG, rootDir: process.cwd() });
  expect(toolNames).toContain("query_architecture");
});

test("propose_refactor is listed in toolNames", () => {
  const { toolNames } = buildMcpServer({ config: DEFAULT_CONFIG, rootDir: process.cwd() });
  expect(toolNames).toContain("propose_refactor");
});

test("apply_refactor is listed in toolNames", () => {
  const { toolNames } = buildMcpServer({ config: DEFAULT_CONFIG, rootDir: process.cwd() });
  expect(toolNames).toContain("apply_refactor");
});

test("Band C tools are listed in toolNames", () => {
  const { toolNames } = buildMcpServer({ config: DEFAULT_CONFIG, rootDir: process.cwd() });
  expect(toolNames).toContain("get_node");
  expect(toolNames).toContain("raw_graph_query");
});

test("explain_finding description promises bounded explanation plus raw evidence", () => {
  const { server } = buildMcpServer({ config: DEFAULT_CONFIG, rootDir: process.cwd() });
  const registeredTool = (server as any)._registeredTools?.["explain_finding"];

  expect(registeredTool?.description).toContain("bounded deterministic explanation");
  expect(registeredTool?.description).toContain("raw evidence");
});

test("get_node MCP schema avoids tuple byteRange for opencode compatibility", async () => {
  const { session, server } = buildMcpServer({ config: DEFAULT_CONFIG, rootDir: process.cwd() });
  const registeredTool = (server as any)._registeredTools?.["get_node"];
  const schema = registeredTool?.inputSchema;
  const shape = typeof schema?._def?.shape === "function" ? schema._def.shape() : schema?.shape;
  const byteRange = shape?.byteRange;

  expect(byteRange?._def?.innerType?._def?.typeName).toBe("ZodObject");

  const spy = vi.spyOn(session, "getNode");
  await registeredTool.handler({ file: "Page.tsx", byteRange: { start: 0, end: 80 } }, {});
  expect(spy).toHaveBeenCalledWith({ file: "Page.tsx", fingerprint: undefined, byteRange: [0, 80] });
});

test("analyze_repo handler passes resolved SHA (not literal 'head') to session.analyzeRepo", async () => {
  const { session, server } = buildMcpServer({ config: DEFAULT_CONFIG, rootDir: process.cwd() });
  const spy = vi.spyOn(session, "analyzeRepo");

  // Invoke the registered handler directly via SDK internals
  const registeredTool = (server as any)._registeredTools?.["analyze_repo"];
  if (registeredTool?.handler) {
    await registeredTool.handler({}, {}).catch(() => {});
  }

  expect(spy).toHaveBeenCalled();
  const commitSha = spy.mock.calls[0]?.[0]?.commitSha;
  expect(commitSha).not.toBe("head");
  // must be either a 40-char hex SHA or "" (empty string = git unavailable)
  const is40Hex = typeof commitSha === "string" && /^[0-9a-f]{40}$/.test(commitSha);
  const isEmpty = commitSha === "";
  expect(is40Hex || isEmpty).toBe(true);
});

// ── E2E wiring test: buildMcpServer forwards proposalBuilders into live Session ──
// This test is the regression guard for CRITICAL-1: proposalBuilders must flow from
// McpServerOpts → buildMcpServer → createSession so production propose_refactor works.
test("buildMcpServer forwards proposalBuilders into Session so prop-drilling finding returns PreviewProposal (not unsupported-rule)", () => {
  const PD_RULE = "react/prop-drilling";
  const PD_FP = "pd-e2e-wiring-fp";

  // Stub finding that will be yielded by the registry factory
  const pdFinding: Finding = {
    id: "finding-pd-e2e",
    ruleId: PD_RULE,
    type: "opportunity",
    fingerprint: { structural: PD_FP, nominal: `nom-${PD_FP}`, positional: `pos-${PD_FP}` },
    analysisVersion: 1,
    fpAlgoVersion: 1,
    producingRunId: "run-e2e",
    commitSha: "sha-e2e",
    severityRaw: "warn",
    evidence: {
      kind: "adapter-metric",
      adapterId: "react",
      ruleId: PD_RULE,
      subject: {
        id: "react:prop-drilling:Middle",
        name: "Middle",
        file: "Middle.tsx",
        span: { file: "Middle.tsx", start: 0, end: 100, kind: "component" as const, astPath: "module>component" },
        fingerprint: "subj-fp",
      },
      roles: [
        { role: "drilled-prop", variant: "theme", file: "Middle.tsx" },
        { role: "upstream-source", variant: "App", file: "App.tsx" },
        { role: "downstream-target", variant: "Leaf", file: "Leaf.tsx" },
      ],
      metrics: { drilledProps: 1, upstreamSources: 1, downstreamTargets: 1, propCount: 3 },
      thresholds: { maxDrilledProps: 0 },
      topology: { directChildIds: ["Leaf-id"], reachableNodeIds: ["App-id"], exceeded: ["propDrilling:theme"] },
    },
    createdAt: 0,
  };

  // Stub builder that returns a real PreviewProposal for PD_RULE
  const stubBuilder: ProposalBuilder = {
    ruleId: PD_RULE,
    build(_input: ProposalBuilderInput): PreviewProposal {
      return {
        status: "preview",
        kind: "preview-only",
        fingerprint: PD_FP,
        ruleId: PD_RULE,
        subject: { name: "Middle", file: "Middle.tsx", span: null },
        observations: ["Middle forwards prop 'theme'."],
        consider: ["Consider React Context."],
        limits: [],
        writeMode: "proposal-only",
      };
    },
  };

  // Registry factory that always yields the pd finding
  const registryFactory = () => {
    const reg = new AnalyzerRegistry();
    reg.register({ ruleId: PD_RULE, framework: "react", analyze: () => [pdFinding] });
    return reg;
  };

  // Build the server via the production entry point, passing proposalBuilders
  const { session } = buildMcpServer({
    config: DEFAULT_CONFIG,
    rootDir: process.cwd(),
    registryFactory,
    proposalBuilders: [stubBuilder],
  });

  // Populate lastPresented by running analysis
  session.analyzeRepo({ files: [{ file: "Middle.tsx", source: "export function Middle({ theme }) { return <span />; }" }], asOf: 0 });

  // The critical assertion: propose_refactor must return a PreviewProposal, NOT unsupported-rule
  const result = session.proposeRefactor({ fingerprint: PD_FP });

  expect(result.status).toBe("preview");
  expect((result as PreviewProposal).kind).toBe("preview-only");
  expect((result as PreviewProposal).ruleId).toBe(PD_RULE);
});
