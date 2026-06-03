# Design: P9-S2 Human-Readable Explanations

## Decision summary

| Area | Decision |
|---|---|
| Extension point | Add optional `explain(finding)` hook to `Analyzer`. |
| Dispatch | `Session.explainFinding` finds the analyzer by `ruleId` in the last analysis registry and uses `analyzer.explain` when available. |
| Fallback | Existing `explainFinding` remains fallback for analyzers without custom explainers. |
| Core boundary | Core owns generic dispatch only; no React rule ids or role strings in core. |
| P11-S2 implementation | `@rai/adapter-react` supplies the human explanation for `react/container-presenter-role-drift`. |
| Contracts | Explanation envelope remains additive; raw evidence/fingerprints/persistence unchanged. |

## Data flow

```text
analyzeRepo(files)
  -> registryFactory(files) creates analyzer registry
  -> analyzers emit findings
  -> Session stores last registry + last presented findings

explainFinding(fingerprint)
  -> find presented finding
  -> find analyzer by finding.ruleId in last registry
  -> if analyzer.explain exists, call it
  -> otherwise use generic core explainability fallback
  -> return raw finding/evidence + explanation + memory
```

## Container/presenter explanation shape

For evidence subject `UserContainer -> UserView` and hook `useState`, summary should read like:

```text
UserContainer renders UserView. UserView looks presenter-like from observed role-name/path evidence, but it also has high-signal hook evidence: useState.
```

Why it matters:

```text
This is worth checking because the repo's naming suggests a container/view split while measured syntax puts state, effect, or data-hook logic on the presenter-like side.
```

Inspect-first guidance:

- `UserContainer -> UserView in src/users.tsx`
- `container evidence: name-suffix:Container`
- `presenter evidence: name-suffix:View`
- `hook evidence: useState`
- `threshold crossed: presenterHighSignalHook:useState`

Limits:

- Does not prove wrong architecture.
- Does not infer team intent, root cause, bug cause, historical change, or required refactoring.
- If this repo intentionally allows hooks in View/Presenter components, treat it as a convention signal rather than a bug.

## Testing plan

- Core test: analyzer-owned explanation hook is used and raw evidence remains unchanged.
- Core test: generic fallback still works when no hook exists.
- Adapter test: container/presenter explanation has human wording, observed evidence, and prohibited-claim guard.
- CLI/smoke: `rai explain` for temp container/presenter fixture includes the human summary and rule id.

## Rollback

Remove `Analyzer.explain`, registry lookup, dispatch changes, and adapter custom explanation. Generic P9 explanation remains available.
