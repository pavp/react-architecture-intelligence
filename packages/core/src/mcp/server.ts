import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createSession, type Session } from "./tools.js";
import type { RaiConfig } from "../config/schema.js";
import { resolveCommitSha } from "../engine/git-sha.js";

export interface McpServerOpts { config: RaiConfig; rootDir: string; }

/** Reads .tsx/.ts source files under rootDir (excluding node_modules/dist) for analysis. */
export function readSources(rootDir: string): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(tsx|jsx|ts|js)$/.test(entry)) out.push({ file: relative(rootDir, full), source: readFileSync(full, "utf8") });
    }
  };
  walk(rootDir);
  return out;
}

/** Build the MCP server + register Band A/B tools (§5). Returns it for serving + the tool names for tests. */
export function buildMcpServer(opts: McpServerOpts): { server: McpServer; session: Session; toolNames: string[] } {
  const server = new McpServer({ name: "rai", version: "0.0.0" });
  const session = createSession({ config: opts.config });
  const toolNames: string[] = [];

  const now = () => Date.now();

  server.tool("analyze_repo", "Analyze the repo; returns counts + fingerprint handles (findings-first).",
    { scope: z.enum(["full", "dirty"]).optional() },
    async () => {
      const files = readSources(opts.rootDir);
      const sha = resolveCommitSha(opts.rootDir);
      const r = session.analyzeRepo({ files, asOf: now(), commitSha: sha ?? "" });
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    });
  toolNames.push("analyze_repo");

  server.tool("find_shared_opportunities", "List shared-component extraction opportunities (conflicts separated).",
    { includeSuppressed: z.boolean().optional() },
    async (args) => {
      const r = session.findSharedOpportunities({ includeSuppressed: args.includeSuppressed });
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    });
  toolNames.push("find_shared_opportunities");

  server.tool("explain_finding", "Return a finding's structured evidence + grounding fields (render only these; do not infer).",
    { fingerprint: z.string() },
    async (args) => {
      const r = session.explainFinding({ fingerprint: args.fingerprint });
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    });
  toolNames.push("explain_finding");

  server.tool("record_feedback", "Record a verdict on a finding (the only memory write path).",
    {
      fingerprint: z.string(),
      ruleId: z.string(),
      verdict: z.enum(["accept", "reject", "wontfix", "confirm", "dismiss"]),
      source: z.enum(["human", "agent"]),
      originRunId: z.string().optional(),
      reason: z.string().optional(),
    },
    async (args) => {
      const r = session.recordFeedback({ ...args, asOf: now() });
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    });
  toolNames.push("record_feedback");

  server.tool("close_session", "Close current analysis session by prompting for explicit finding decisions or recording explicit decisions only.",
    {
      discussed: z.array(z.string()).optional(),
      summary: z.string().optional(),
      decisions: z.array(z.object({
        fingerprint: z.string(),
        ruleId: z.string(),
        verdict: z.enum(["accept", "reject", "wontfix", "confirm", "dismiss"]),
        reason: z.string().optional(),
      })).optional(),
    },
    async (args) => {
      const r = session.closeSession({ ...args, asOf: now() });
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    });
  toolNames.push("close_session");

  return { server, session, toolNames };
}

/** Serve over stdio (called by the CLI). */
export async function serveStdio(opts: McpServerOpts): Promise<void> {
  const { server } = buildMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
