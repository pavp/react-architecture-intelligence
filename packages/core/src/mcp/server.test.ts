import { expect, test } from "vitest";
import { buildMcpServer } from "./server.js";
import { DEFAULT_CONFIG } from "../config/resolve.js";

test("buildMcpServer returns a server with the expected tool names registered", () => {
  const { toolNames } = buildMcpServer({ config: DEFAULT_CONFIG, rootDir: process.cwd() });
  for (const t of ["analyze_repo", "find_shared_opportunities", "explain_finding", "record_feedback", "close_session"]) {
    expect(toolNames).toContain(t);
  }
});
