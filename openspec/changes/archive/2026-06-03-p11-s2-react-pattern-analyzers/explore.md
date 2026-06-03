status: explored_not_written_tool_blocked

executive_summary: |
  Best P11-S2 slice: container/presenter role-name divergence analyzer.
  Reason: current graph already has enough deterministic syntax-derived evidence:
  `ComponentNode.name`, `file`, `span`, `hookCalls`, `childComponents`, render edges, export kind.
  No `@rai/core` fact expansion needed. Analyzer can live fully in `@rai/adapter-react`.
  Claims can stay bounded: “component has observed container/presenter naming evidence and observed hook/render evidence that disagrees with that role surface,” not intent/root cause/remediation.

recommended_slice:
  family: container/presenter
  rule_id: react/container-presenter-role-drift
  why_best:
    - Works with existing graph facts; no new core syntax fact kind needed.
    - Lower false-positive risk than provider/context, forms, controlled/uncontrolled, or design-system usage.
    - TDD slice can be small/reviewable under 1200-line budget.
    - Fits P11 guardrails: adapter-owned, pure sync, deterministic, no side effects.
  bounded_behavior:
    - Infer only name/file role seeds from observed strings like `*Container`, `*Presenter`, `*View`, maybe `/containers/` and `/presenters/`.
    - Compare against observed syntax facts:
      - container-like: hook calls and/or renders presenter-like child.
      - presenter-like: no hook calls or limited hook set if policy chooses strict first slice.
    - Emit finding only when strong paired evidence exists, e.g. `UserContainer` renders `UserView`, but `UserView` has state/data hook calls.
    - Message must say “observed role-name divergence,” not “wrong architecture,” “bad separation,” or “must refactor.”

alternatives_considered:
  - family: provider/context
    verdict: defer
    reason: Existing facts capture `createContext`, `useContext`, and JSX `<X.Provider>`, but call facts do not capture call arguments/bindings, so `useContext(ThemeContext)` cannot be grounded without source parsing or generic fact expansion.
  - family: controlled/uncontrolled
    verdict: defer
    reason: Needs JSX attributes (`value`, `defaultValue`, `onChange`, `checked`) and likely state linkage. Current JSX facts only store tag/parentTag.
  - family: forms
    verdict: defer
    reason: Needs JSX attributes, event handlers, submit/action semantics, form library conventions. Too much new generic extraction for S2.
  - family: data_fetching
    verdict: possible_later
    reason: Existing call/import facts can see `fetch`, `useQuery`, `axios.get`, etc., but divergence claims risk generic best-practice noise unless repo-local convention evidence is carefully specified.
  - family: design_system_usage
    verdict: defer
    reason: Needs config/catalog of design-system packages/components or risky hardcoded ecosystem assumptions.
  - family: overlays_beyond_compound_primitives
    verdict: defer
    reason: P11-S1 already covers compound primitive API divergence; broader overlay behavior needs catalog growth and likely JSX attributes/portals.
  - family: broad_api_conventions
    verdict: defer
    reason: Too broad for one strict-TDD slice; high spec ambiguity.

likely_files:
  openspec:
    - openspec/changes/p11-s2-react-pattern-analyzers/proposal.md
    - openspec/changes/p11-s2-react-pattern-analyzers/design.md
    - openspec/changes/p11-s2-react-pattern-analyzers/tasks.md
    - openspec/changes/p11-s2-react-pattern-analyzers/specs/react-pattern-analyzers/spec.md
    - openspec/changes/p11-s2-react-pattern-analyzers/specs/pattern-drift/spec.md
  adapter_react:
    - packages/adapter-react/src/container-presenter-role-drift.ts
    - packages/adapter-react/src/container-presenter-role-drift.test.ts
    - packages/adapter-react/src/core-adapter.ts
    - packages/adapter-react/src/core-adapter.test.ts
    - packages/adapter-react/src/index.ts
  fixtures:
    - fixtures/react/container-presenter/
  docs_after_apply:
    - docs/STATUS.md
    - docs/ROADMAP.md
  avoid_by_default:
    - packages/core/**
    - packages/cli/** unless integration count/fixture coverage needed
    - .gitignore
    - .pi/

proposed_change_id: p11-s2-react-pattern-analyzers

risks:
  - Naming convention inference can look like intent. Mitigation: phrase as observed role-name/syntax divergence only.
  - Presenter hook policy can be noisy. Mitigation: first slice should require paired evidence and start with high-signal hooks only, or threshold >0 only if name/path strongly presenter-like.
  - Overlap with existing core analyzers possible. Mitigation: keep rule focused on React role naming divergence, not generic coupling/over-abstraction.
  - If apply forecast exceeds 1200 changed lines, pause before apply and ask delivery decision.
  - Engram tools unavailable here; parent must persist memory/artifact.

next_recommended:
  - Create OpenSpec proposal/design/tasks for `react/container-presenter-role-drift`.
  - Add spec requirements:
    - adapter-owned boundary
    - pure deterministic execution
    - container/presenter role-name evidence
    - grounded evidence/no intent claims
    - deferred families remain silent
  - Strict TDD:
    - RED tests for healthy pair silent.
    - RED tests for presenter-like component with observed hook calls in paired container/presenter surface.
    - Determinism test with reversed graph order.
    - Frozen input/no mutation test.
  - Later verify with:
    - pnpm test && pnpm test:launcher
    - pnpm typecheck
    - pnpm build
    - pnpm lint
    - git diff --check

skill_resolution: none

memory_ready_notes:
  - Discovery: Current `PatternCallFact` stores only callee, not arguments. This makes provider/context and controlled/uncontrolled lower-quality without generic fact expansion.
  - Decision candidate: P11-S2 should prefer container/presenter because existing `ComponentNode` + render edges support grounded adapter-only analysis with no core changes.
  - Guardrail: Keep `@rai/core` unchanged by default; implement analyzer in `packages/adapter-react` and reuse existing adapter composition.