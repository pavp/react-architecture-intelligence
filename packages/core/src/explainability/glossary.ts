export interface GlossaryEntry {
  term: string;
  definition: string;
  known: boolean;
}

export const glossaryEntries: GlossaryEntry[] = [
  { term: "cosine", known: true, definition: "Similarity score for two code shapes; higher values mean stronger structural resemblance." },
  { term: "propOverlap", known: true, definition: "Ratio of props shared by compared components in shared-extraction evidence." },
  { term: "hookOverlap", known: true, definition: "Ratio of hook calls shared by compared components or hooks in evidence." },
  { term: "sharedSurface", known: true, definition: "Props present across all compared instances; useful as existing shared API evidence." },
  { term: "groundingFields", known: true, definition: "Evidence keys used to build presentation text; raw finding data remains authoritative." },
  { term: "span", known: true, definition: "Source file byte range and syntax path that ties a finding or node to code." },
  { term: "diagnostic", known: true, definition: "Analyzer or adapter execution note; diagnostics are not findings or feedback targets." },
  { term: "fanIn", known: true, definition: "Count of render or call edges pointing into the measured component or hook." },
  { term: "fanOut", known: true, definition: "Count of render or call edges leaving the measured component or hook." },
  { term: "directChildren", known: true, definition: "Number of immediate rendered child components recorded in topology evidence." },
  { term: "reachableDepth", known: true, definition: "Longest render or dependency distance reachable from the measured node." },
  { term: "roles", known: true, definition: "Adapter-assigned labels such as route or client component, derived from project structure." },
  { term: "metrics", known: true, definition: "Measured numeric values that an analyzer compared against configured thresholds." },
  { term: "thresholds", known: true, definition: "Configured numeric limits used to decide whether measured metrics emit a finding." },
  { term: "topology", known: true, definition: "Graph relationship evidence such as direct children, reachable nodes, and exceeded measures." },
];

const glossaryByTerm = new Map(glossaryEntries.map((entry) => [entry.term, entry]));

export function explainTerm(term: string): GlossaryEntry {
  const known = glossaryByTerm.get(term);
  if (known) return known;
  return { term, known: false, definition: "Unknown term; treat it as raw evidence from the finding." };
}
