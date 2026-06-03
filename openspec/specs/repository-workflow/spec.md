# Repository Workflow Specification

## Purpose

Define policy for `main` trunk, naming, PR template, CI governance checks, release tags, rollback, and publish gates before real publishing.

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

P8-S3c MUST document branch naming, commit naming, PR title, and PR template policy. Branches SHOULD use short-lived `feat/`, `fix/`, `docs/`, `chore/`, or `test/` prefixes plus kebab-case scope. Commit messages and PR titles MUST use Conventional Commit form and MUST be enforceable by CI checks. PR descriptions MUST preserve the repository template and fill type, verification, and scope fields. Conventional Commit scopes SHOULD remain flexible and MUST NOT require a fixed package-scope list.

#### Scenario: Naming policy is explicit

- GIVEN guidance names branch, commit, PR title, or body rules
- WHEN policy is reviewed
- THEN it SHALL include examples and template expectations
- AND SHALL NOT require new local tooling

#### Scenario: Conventional naming is enforceable

- GIVEN CI evaluates commit messages or PR titles
- WHEN naming policy is checked
- THEN invalid Conventional Commit form MUST fail
- AND valid flexible scopes MUST pass without a fixed package list

### Requirement: PR and Chained Review Policy

Application changes MUST enter trunk through PRs before reaching `main`, have exactly one `type:*` label when labels are used, complete the repository PR template, pass CI, and use Conventional Commit squash merge. Direct commits to `main` are not allowed except for explicit maintainer recovery. Oversized work MUST split into chained/stacked units unless maintainers approve `size:exception`. PR-title CI MUST run on `pull_request` events and validate the squash-title candidate before merge.

#### Scenario: PR meets gates

- GIVEN a PR targets trunk
- WHEN it reaches `main` through a PR, has one `type:*` label when labels are used, completes the template, passes CI, and is reviewable
- THEN it MAY be squash-merged with a Conventional Commit title

#### Scenario: PR title fails governance check

- GIVEN a PR title is not a valid Conventional Commit squash-title candidate
- WHEN the `pull_request` workflow runs
- THEN CI MUST fail the PR-title governance check
- AND the PR MUST NOT be merge-ready

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

P8-S3c MUST replace automation deferral with CI-enforceable Conventional Commit validation for commit messages and PR titles. Local hooks MAY remain optional and MUST NOT be required for compliance. `semantic-release` MUST NOT be added in P8. Automated versioning, real publishing, and release artifact publication MUST remain out of scope.

#### Scenario: Commit messages are CI-enforced

- GIVEN commit messages are checked during repository governance validation
- WHEN CI runs Conventional Commit validation
- THEN invalid commit messages MUST fail
- AND valid Conventional Commit messages MUST pass

#### Scenario: Local hooks remain optional

- GIVEN a contributor has no local git hooks installed
- WHEN they rely on CI validation and package scripts only
- THEN repository compliance MUST remain possible
- AND no required workflow MUST depend on local hooks

#### Scenario: Release automation remains excluded

- GIVEN P8-S3c governance automation is implemented
- WHEN dependencies and workflows are reviewed
- THEN `semantic-release` MUST NOT be present
- AND automated versioning or real publish behavior MUST NOT be added

### Requirement: Remote Mutation and Rollback Scope

P8-S3c MUST document remote/default-branch migration and retirement steps, but MUST NOT execute branch renames, remote changes, default-branch changes, protections, tags, or publishing without explicit confirmation. Rollback guidance MUST revert only docs, governance checks, dependency/config changes, and release checks.

#### Scenario: Remote mutation needs confirmation

- GIVEN a task would change remote branches, default branch, protections, tags, or publish channels
- WHEN P8-S3c is applied
- THEN the task MUST remain documented and gated
- AND MUST NOT run automatically
