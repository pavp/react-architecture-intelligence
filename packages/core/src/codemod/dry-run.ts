import { pass1 } from "../parse/pass1.js";
import type { SourceFile } from "../parse/graph-build.js";
import type { SharedExtractionProposal } from "./proposal.js";

export type DryRunRefusalReason = "proposal-refused" | "missing-source" | "stale-span" | "unsafe-variance-parameter";

export type DryRunPatchPreview =
  | { status: "ok"; touchedFiles: string[]; patch: string; rollbackPatch: string }
  | { status: "refused"; reason: "proposal-refused" }
  | { status: "refused"; reason: "missing-source"; file: string }
  | { status: "refused"; reason: "stale-span"; file: string }
  | { status: "refused"; reason: "unsafe-variance-parameter"; parameter: string };

export interface DryRunPatchInput {
  proposal: SharedExtractionProposal;
  sources: SourceFile[];
  targetFile: string;
}

export function previewSharedExtractionPatch(input: DryRunPatchInput): DryRunPatchPreview {
  if (input.proposal.status !== "ok") return { status: "refused", reason: "proposal-refused" };
  const proposal = input.proposal;
  for (const parameter of proposal.varianceParameters) {
    if (!isSafeIdentifier(parameter)) return { status: "refused", reason: "unsafe-variance-parameter", parameter };
  }

  const byFile = new Map(input.sources.map((source) => [source.file, source.source]));
  for (const instance of proposal.sourceInstances) {
    const source = byFile.get(instance.span.file);
    if (source === undefined) return { status: "refused", reason: "missing-source", file: instance.span.file };
    const reparsed = pass1(instance.span.file, source).components.find((component) => component.name === instance.name);
    if (!reparsed || reparsed.span.start !== instance.span.start || reparsed.span.end !== instance.span.end) {
      return { status: "refused", reason: "stale-span", file: instance.span.file };
    }
  }

  const touchedFiles = [...new Set([...proposal.sourceInstances.map((instance) => instance.span.file), input.targetFile])].sort();
  const componentSource = sharedComponentSource(proposal);
  const patch = addFilePatch(input.targetFile, componentSource);
  const rollbackPatch = deleteFilePatch(input.targetFile, componentSource);

  return { status: "ok", touchedFiles, patch, rollbackPatch };
}

function sharedComponentSource(proposal: Extract<SharedExtractionProposal, { status: "ok" }>): string {
  const props = [...new Set([...proposal.sharedProps, ...proposal.varianceParameters])].sort();
  return `export function ${proposal.componentName}({ ${props.join(", ")} }) {\n  return null;\n}\n`;
}

function addFilePatch(file: string, source: string): string {
  const lines = source.split("\n").slice(0, -1);
  return [
    `diff --git a/${file} b/${file}`,
    `new file mode 100644`,
    `index 0000000..0000000`,
    `--- /dev/null`,
    `+++ b/${file}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
    "",
  ].join("\n");
}

function deleteFilePatch(file: string, source: string): string {
  const lines = source.split("\n").slice(0, -1);
  return [
    `diff --git a/${file} b/${file}`,
    `deleted file mode 100644`,
    `index 0000000..0000000`,
    `--- a/${file}`,
    `+++ /dev/null`,
    `@@ -1,${lines.length} +0,0 @@`,
    ...lines.map((line) => `-${line}`),
    "",
  ].join("\n");
}

function isSafeIdentifier(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name);
}
