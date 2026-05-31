import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { buildMcpServer } from "./server.js";
import { DEFAULT_CONFIG } from "../config/resolve.js";

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
