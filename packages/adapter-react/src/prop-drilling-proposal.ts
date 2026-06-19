import type { ProposalBuilder, ProposalBuilderInput, PreviewProposal } from "@rai/core";
import type { AdapterMetricEvidence } from "@rai/core";

export const PROP_DRILLING_PROPOSAL_RULE_ID = "react/prop-drilling";

// Non-prescriptive consider template — lists options without asserting which is correct.
const CONSIDER_TEMPLATE: readonly string[] = Object.freeze([
  "React Context API: lift the shared value to a context provider so intermediate components do not need to declare it in their props.",
  "Shared custom hook: encapsulate the value in a hook consumed directly by the components that need it, removing the prop from the chain.",
  "Prop consolidation / composition: restructure the component tree so the value is only passed where it is genuinely used, or replace prop-threading with render-prop or children composition patterns.",
  "RAI does not know which option is correct or safe to apply without developer review. Evaluate each option against your team's architecture, performance constraints, and testing coverage.",
]);

/**
 * Pure builder factory for react/prop-drilling preview proposals.
 * Grounded 1:1 in AdapterMetricEvidence; no invented strings; no patch, diff, or write.
 */
export function buildPropDrillingProposalBuilder(): ProposalBuilder {
  return {
    ruleId: PROP_DRILLING_PROPOSAL_RULE_ID,
    build({ finding, limits }: ProposalBuilderInput): PreviewProposal | { status: "refused"; reason: "unsupported-rule" } {
      if (finding.ruleId !== PROP_DRILLING_PROPOSAL_RULE_ID) {
        return { status: "refused", reason: "unsupported-rule" };
      }

      const evidence = finding.evidence as AdapterMetricEvidence;
      const drilledProps = roleVariants(evidence, "drilled-prop").sort();
      const upstreamSources = roleVariants(evidence, "upstream-source");
      const downstreamTargets = roleVariants(evidence, "downstream-target");

      const upstreamRole = upstreamSources[0] ?? "unknown";
      const downstreamRole = downstreamTargets[0] ?? "unknown";

      const propList = drilledProps.join(", ");
      const observations: string[] = [
        drilledProps.length === 1
          ? `${evidence.subject.name} forwards prop "${drilledProps[0]}" through its interface without appearing to transform it.`
          : `${evidence.subject.name} forwards ${drilledProps.length} props (${propList}) through its interface without appearing to transform them.`,
        `Upstream source: ${upstreamRole}. Downstream target: ${downstreamRole}.`,
        `Total props declared: ${evidence.metrics["propCount"] ?? "unknown"}. Drilled props detected: ${drilledProps.length}.`,
      ];

      const proposal: PreviewProposal & { drilledProps: string[]; upstreamRole: string; downstreamRole: string } = {
        status: "preview",
        kind: "preview-only",
        fingerprint: finding.fingerprint.structural,
        ruleId: PROP_DRILLING_PROPOSAL_RULE_ID,
        subject: {
          name: evidence.subject.name,
          file: evidence.subject.file,
          span: evidence.subject.span,
        },
        observations,
        consider: [...CONSIDER_TEMPLATE],
        limits,
        writeMode: "proposal-only",
        drilledProps,
        upstreamRole,
        downstreamRole,
      };

      return proposal;
    },
  };
}

function roleVariants(evidence: AdapterMetricEvidence, roleName: string): string[] {
  return [...new Set(
    evidence.roles
      .filter((r) => r.role === roleName)
      .map((r) => r.variant),
  )].sort();
}
