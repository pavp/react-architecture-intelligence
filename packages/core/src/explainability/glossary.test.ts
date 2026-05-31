import { expect, test } from "vitest";
import { explainTerm, glossaryEntries } from "./glossary.js";

test("glossary defines required evidence and output terms with concise RAI semantics", () => {
  const required = [
    "cosine",
    "propOverlap",
    "hookOverlap",
    "sharedSurface",
    "groundingFields",
    "span",
    "diagnostic",
    "fanIn",
    "fanOut",
    "directChildren",
    "reachableDepth",
    "roles",
    "metrics",
    "thresholds",
    "topology",
  ];

  expect(glossaryEntries.map((entry) => entry.term).sort()).toEqual([...required].sort());
  for (const term of required) {
    const entry = explainTerm(term);
    expect(entry).toMatchObject({ term, known: true });
    expect(entry.definition.length).toBeGreaterThan(20);
    expect(entry.definition.length).toBeLessThanOrEqual(180);
  }
});

test("unknown glossary terms are labeled as raw instead of fabricated", () => {
  expect(explainTerm("ownerIntent")).toEqual({
    term: "ownerIntent",
    known: false,
    definition: "Unknown term; treat it as raw evidence from the finding.",
  });
});
