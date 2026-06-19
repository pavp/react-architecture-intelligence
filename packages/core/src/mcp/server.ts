import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createSession, type RegistryFactory, type Session } from "./tools.js";
import type { ProposalBuilder } from "../codemod/proposal.js";
import type { RaiConfig } from "../config/schema.js";
import { resolveCommitSha } from "../engine/git-sha.js";
import { createGitWorkspace } from "../codemod/git-workspace.js";

export interface McpServerOpts { config: RaiConfig; rootDir: string; registryFactory?: RegistryFactory | undefined; proposalBuilders?: ProposalBuilder[] | undefined; }

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
  const session = createSession({ config: opts.config, registryFactory: opts.registryFactory, proposalBuilders: opts.proposalBuilders });
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

  server.tool("propose_refactor", "Return a deterministic no-write refactor proposal for a current finding fingerprint.",
    { fingerprint: z.string() },
    async (args) => {
      const r = session.proposeRefactor({ fingerprint: args.fingerprint });
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    });
  toolNames.push("propose_refactor");

  server.tool("apply_refactor", "Apply a gated refactor after dry-run, typecheck, tests, git-clean, and commit.",
    {
      fingerprint: z.string(),
      targetFile: z.string(),
      commitMessage: z.string().optional(),
      typecheckCommand: z.array(z.string()).optional(),
      testCommand: z.array(z.string()).optional(),
    },
    async (args) => {
      const files = readSources(opts.rootDir);
      const workspace = createGitWorkspace({
        rootDir: opts.rootDir,
        typecheckCommand: args.typecheckCommand ?? ["pnpm", "typecheck"],
        testCommand: args.testCommand ?? ["pnpm", "test"],
      });
      const r = session.applyRefactor({
        fingerprint: args.fingerprint,
        targetFile: args.targetFile,
        commitMessage: args.commitMessage,
        sources: files,
        workspace,
      });
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    });
  toolNames.push("apply_refactor");

  server.tool("explain_finding", "Return a finding's raw evidence plus bounded deterministic explanation and grounding fields (do not infer).",
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

  server.tool("get_drift", "Return snapshot diff between two analyzed commits (read-only).",
    {
      baseCommit: z.string(),
      headCommit: z.string().optional(),
      ruleId: z.string().optional(),
      fingerprint: z.string().optional(),
    },
    async (args) => {
      const r = session.getDrift(args);
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    });
  toolNames.push("get_drift");

  server.tool("query_architecture", "Answer bounded graph questions from the latest analysis. question is one of: renders, rendered-by, fan-in, fan-out, reachability. target is a component name or a node id of the form {file}#N; enumerate valid targets via raw_graph_query 'MATCH nodes'. depth (optional) bounds reachability up to 5.",
    {
      question: z.string(),
      target: z.string(),
      depth: z.number().optional(),
    },
    async (args) => {
      const r = session.queryArchitecture(args);
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    });
  toolNames.push("query_architecture");

  server.tool("get_node", "Return bounded details for a node in the latest analyzed repo graph.",
    {
      fingerprint: z.string().optional(),
      file: z.string().optional(),
      byteRange: z.object({ start: z.number(), end: z.number() }).optional(),
    },
    async (args) => {
      const r = session.getNode({
        fingerprint: args.fingerprint,
        file: args.file,
        byteRange: args.byteRange ? [args.byteRange.start, args.byteRange.end] : undefined,
      });
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    });
  toolNames.push("get_node");

  server.tool("raw_graph_query", "Return allowlisted graph rows from the latest analysis. cypherLike accepts 'MATCH nodes' or 'MATCH edges'. Rows are capped at 100 (limit is clamped to 1..100); results include truncated:boolean and total:number (full pre-slice count) so you can tell how many rows exist. 'MATCH nodes' is the enumeration path for valid query_architecture targets.",
    {
      cypherLike: z.string(),
      limit: z.number(),
    },
    async (args) => {
      const r = session.rawGraphQuery(args);
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    });
  toolNames.push("raw_graph_query");

  server.tool("find_proposals", "List actionable findings: those with a registered proposal builder, or non-conflict shared-extraction findings. Conflict-typed shared-extraction findings are excluded. Read-only — no mutations.",
    {
      ruleId: z.string().optional(),
      includeSuppressed: z.boolean().optional(),
    },
    async (args) => {
      const r = session.findProposals(args);
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    });
  toolNames.push("find_proposals");

  return { server, session, toolNames };
}

/** Serve over stdio (called by the CLI). */
export async function serveStdio(opts: McpServerOpts): Promise<void> {
  const { server } = buildMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
