export const RAI_VERSION = "0.0.0";

export * from "./types.js";
export { resolveConfig, DEFAULT_CONFIG } from "./config/resolve.js";
export { analyzeRepo } from "./engine/pipeline.js";
export { createSession, Session } from "./mcp/tools.js";
export { buildMcpServer, serveStdio } from "./mcp/server.js";
export { sharedExtraction, RULE_ID as SHARED_EXTRACTION_RULE_ID } from "./analyzers/shared-extraction.js";
