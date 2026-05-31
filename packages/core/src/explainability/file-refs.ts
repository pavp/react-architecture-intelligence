import type { PresentedFinding, Span } from "../types.js";

export interface FindingFileRef {
  file: string;
  source: string;
  span?: Span | undefined;
}

export function findingFileRefs(finding: PresentedFinding): FindingFileRef[] {
  const evidence = finding.evidence;
  const refs: FindingFileRef[] = [];
  const pushSpan = (source: string, span: Span) => refs.push({ file: span.file, source, span });
  const pushFile = (source: string, file: string) => refs.push({ file, source });

  if (evidence.kind === "shared-extraction") {
    evidence.instances.forEach((instance, index) => pushSpan(`instances.${index}`, instance.span));
  } else if (evidence.kind === "render-coupling" || evidence.kind === "over-abstraction") {
    pushSpan("component", evidence.component.span);
  } else if (evidence.kind === "hook-topology") {
    pushSpan("hook", evidence.hook.span);
  } else if (evidence.kind === "boundary-violation") {
    pushSpan("edge.from", evidence.edge.from.span);
    pushSpan("edge.to", evidence.edge.to.span);
  } else if (evidence.kind === "adapter-metric") {
    pushSpan("subject", evidence.subject.span);
    evidence.roles.forEach((role, index) => pushFile(`roles.${index}`, role.file));
  }

  return uniqueRefs(refs);
}

export function findingMatchesFile(finding: PresentedFinding, file: string): boolean {
  const target = normalizeFile(file);
  return findingFileRefs(finding).some((ref) => normalizeFile(ref.file) === target);
}

function uniqueRefs(refs: FindingFileRef[]): FindingFileRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.source}:${ref.file}:${ref.span?.start ?? ""}:${ref.span?.end ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeFile(file: string): string {
  return file.replace(/^\.\//, "");
}
