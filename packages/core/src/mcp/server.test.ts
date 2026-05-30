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
