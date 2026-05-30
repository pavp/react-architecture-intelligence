export const RAI_VERSION = "0.0.0";

export * from "./types.js";
export { resolveConfig, DEFAULT_CONFIG } from "./config/resolve.js";
export { analyzeRepo } from "./engine/pipeline.js";
export { createSession, Session } from "./mcp/tools.js";
export { buildMcpServer, serveStdio, readSources } from "./mcp/server.js";
export { sharedExtraction, RULE_ID as SHARED_EXTRACTION_RULE_ID } from "./analyzers/shared-extraction.js";
export { renderCoupling, RULE_ID as RENDER_COUPLING_RULE_ID } from "./analyzers/render-coupling.js";
export { overAbstraction, RULE_ID as OVER_ABSTRACTION_RULE_ID } from "./analyzers/over-abstraction.js";
export { hookTopology, RULE_ID as HOOK_TOPOLOGY_RULE_ID } from "./analyzers/hook-topology.js";
export { AnalyzerRegistry, createDefaultAnalyzerRegistry } from "./analyzers/registry.js";
