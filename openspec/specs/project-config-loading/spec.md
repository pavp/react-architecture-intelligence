# Spec: project-config-loading

Capability promoted from delta `openspec/changes/p13-s1-rai-calibrate/spec.md` at archive (2026-06-07).
Change: `p13-s1-rai-calibrate` · Persistence: hybrid

---

## ADDED Requirements

### Requirement: Project Config File Loading

The system MUST provide `loadProjectConfig(dir)` that reads `rai.config.json` from the project root.
When the file is absent, it MUST return `{}` so resolved config equals the all-defaults config
(backward-compatible, no behavior change). When the file is present, its contents MUST be parsed and
validated via `ConfigSchema.partial()` before being merged over defaults. The loader MUST live
outside `@rai/core` (in the CLI package) so `@rai/core` stays framework-agnostic and free of
filesystem/path imports for calibration modules.

#### Scenario: Absent config file resolves to defaults

- GIVEN a project directory with no `rai.config.json` at its root
- WHEN `loadProjectConfig(dir)` runs
- THEN it returns `{}`
- AND the resolved config equals the current all-defaults config
- AND `analyze`, `doctor`, and other commands behave identically to before this change.

#### Scenario: Present config file is parsed, validated, and merged

- GIVEN a project directory with a valid `rai.config.json` containing a partial override
  (e.g. `{ "shared": { "minInstances": 5 } }`)
- WHEN `loadProjectConfig(dir)` runs and the result is resolved
- THEN the override is validated via `ConfigSchema.partial()`
- AND the override is merged over defaults
- AND keys not overridden retain their default values.

#### Scenario: Invalid config file is reported, not silently ignored

- GIVEN a project directory with a `rai.config.json` that violates `ConfigSchema.partial()`
  (e.g. a value outside an allowed range)
- WHEN `loadProjectConfig(dir)` runs
- THEN loading fails with an actionable validation error
- AND no partially-applied or default-substituted config silently replaces the user's intent.

### Requirement: Backward-Compatible CLI Wiring

`loadProjectConfig(dir)` MUST be wired into the existing `resolveConfig({})` call sites in the CLI
(`packages/cli/src/cli.ts` analyze/explain/mcp/backfill/serveStdio sites and
`packages/cli/src/doctor.ts`). With no `rai.config.json` present, every wired command MUST produce
output byte-identical to current behavior. The wiring MUST NOT change analyzer logic, the config
schema, or the database schema.

#### Scenario: Wired commands unchanged without a config file

- GIVEN no `rai.config.json` is present at the project root
- WHEN any wired command (`analyze`, `explain`, `mcp`, `backfill`, `doctor`) runs
- THEN its resolved config equals the current all-defaults config
- AND its output is byte-identical to behavior before this change.

#### Scenario: Wired commands honor a present config file

- GIVEN a valid `rai.config.json` with a partial override at the project root
- WHEN a wired command runs
- THEN the command's resolved config reflects the merged override
- AND analysis behavior changes only as the override dictates, with no schema or analyzer change.

---

## Out of Scope (explicit)

The following are NOT part of P13-S1:

- Any change to analyzer logic, the config schema (`ConfigSchema`), or the database schema.
- `doctor.ts` synthetic health-probe sites (D6 — intentionally left as `resolveConfig({})` because
  they probe synthetic MCP construction, not actual project analysis).

## Traceability

| Proposal acceptance signal | Requirement(s) |
|----------------------------|----------------|
| Absent `rai.config.json` → defaults byte-identical | Project Config File Loading, Backward-Compatible CLI Wiring |
| Present config override merged over defaults | Project Config File Loading, Backward-Compatible CLI Wiring |
