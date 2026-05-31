# Repository Workflow Specification

## Purpose

Define policy for `main` trunk, naming, PR template, release tags, rollback, and publish gates before real publishing.

## Requirements

### Requirement: Main Trunk Workflow

The repository MUST use trunk-based workflow with `main` as trunk/default target. Future work SHOULD use short-lived work-unit branches merged/squash-merged to `main`. Legacy `feat/rai-mvp-p0-p3` SHALL retire after P8. GitFlow and long-lived `develop`, `release/*`, or `hotfix/*` branches MUST NOT be required.

#### Scenario: Main is principal trunk

- GIVEN guidance names repository trunk
- WHEN contribution guidance names the merge target
- THEN it SHALL identify `main` as trunk/default target
- AND SHALL describe `feat/rai-mvp-p0-p3` as legacy integration to retire after P8

#### Scenario: GitFlow branch proposal rejected

- GIVEN proposed workflow requires long-lived support branches
- WHEN policy compliance is reviewed
- THEN the proposal MUST be rejected or deferred outside this change

### Requirement: Naming Policy

P8-S3a MUST document branch naming, commit naming, PR title, and PR template policy. Branches SHOULD use short-lived `feat/`, `fix/`, `docs/`, `chore/`, or `test/` prefixes plus kebab-case scope. Commit messages and PR titles MUST use Conventional Commit form. PR descriptions MUST preserve the repository template and fill issue, type, verification, and scope fields.

#### Scenario: Naming policy is explicit

- GIVEN guidance names branch, commit, PR title, or body rules
- WHEN policy is reviewed
- THEN it SHALL include examples and template expectations
- AND SHALL NOT require new local tooling

### Requirement: PR and Chained Review Policy

Changes MUST enter trunk through PRs that link approved issue, have exactly one `type:*` label, complete the repository PR template, pass CI, and use Conventional Commit squash merge. Oversized work MUST split into chained/stacked units unless maintainers approve `size:exception`.

#### Scenario: PR meets gates

- GIVEN a PR targets trunk
- WHEN it links approved issue, has one `type:*` label, completes the template, passes CI, and is reviewable
- THEN it MAY be squash-merged with a Conventional Commit title

### Requirement: Release Tag Policy

Releases SHALL originate only from `main` commits. Stable tags MUST use `vX.Y.Z`; prerelease tags MAY use `vX.Y.Z-rc.N`. Published tags MUST NOT move. Rollback MUST use new patch/prerelease tag. GoReleaser/manual tag authority SHALL remain. P8-S3a MUST NOT add `semantic-release`, create real tags, or publish artifacts.

#### Scenario: Valid tag source

- GIVEN a tag follows `vX.Y.Z` or `vX.Y.Z-rc.N` and points at `main`
- WHEN release readiness is reviewed
- THEN the tag MAY proceed to maintainer release gates

#### Scenario: Invalid tag source

- GIVEN a tag is unprotected, invalid, moved after publication, or not from `main`
- WHEN release readiness is reviewed
- THEN publishing MUST remain blocked

### Requirement: Real Publish Gate

Real publishing MUST remain disabled until P8-S3b maintainer setup provides channels, secrets, permissions, `main`/tag protection, explicit remote/default-branch confirmation, and checks. Dry-run validation MAY continue, but MUST NOT create public artifacts or package publications.

#### Scenario: Real publish blocked without gates

- GIVEN any required maintainer gate is missing
- WHEN real publish is requested
- THEN the system MUST reject request with documented missing prerequisites

### Requirement: Automation Deferral

P8-S3a MUST NOT add dependencies. Commitlint and PR-title workflow MAY be considered in future P8-S3c, with CI enforcement preferred over local hooks. Local hooks MAY remain optional later.

#### Scenario: Automation is deferred

- GIVEN naming policy needs enforcement beyond documentation
- WHEN P8-S3a is applied
- THEN dependency and workflow additions SHALL remain deferred to future P8-S3c

### Requirement: Remote Mutation and Rollback Scope

P8-S3a MUST document remote/default-branch migration and retirement steps, but MUST NOT execute branch renames, remote changes, default-branch changes, protections, tags, or publishing without explicit confirmation. Rollback guidance MUST revert only docs and release checks.

#### Scenario: Remote mutation needs confirmation

- GIVEN a task would change remote branches, default branch, protections, tags, or publish channels
- WHEN P8-S3a is applied
- THEN the task MUST remain documented and gated
- AND MUST NOT run automatically
