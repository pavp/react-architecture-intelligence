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
  const patch = [
    `--- /dev/null`,
    `+++ ${input.targetFile}`,
    componentSource,
    ...proposal.sourceInstances.flatMap((instance) => [`--- ${instance.span.file}`, `+++ ${instance.span.file}`, `@@ replace ${instance.name}`, `<${proposal.componentName} />`]),
  ].join("\n") + "\n";
  const rollbackPatch = [
    `--- ${input.targetFile}`,
    `+++ /dev/null`,
    componentSource,
    ...proposal.sourceInstances.flatMap((instance) => [`--- ${instance.span.file}`, `+++ ${instance.span.file}`, `@@ restore ${instance.name}`]),
  ].join("\n") + "\n";

  return { status: "ok", touchedFiles, patch, rollbackPatch };
}

function sharedComponentSource(proposal: Extract<SharedExtractionProposal, { status: "ok" }>): string {
  const props = [...new Set([...proposal.sharedProps, ...proposal.varianceParameters])].sort();
  return `export function ${proposal.componentName}({ ${props.join(", ")} }) {\n  return null;\n}`;
}

function isSafeIdentifier(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name);
}
