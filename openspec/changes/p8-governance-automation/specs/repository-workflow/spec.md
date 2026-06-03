# Delta for repository-workflow

## MODIFIED Requirements

### Requirement: Naming Policy

P8-S3c MUST document branch naming, commit naming, PR title, and PR template policy. Branches SHOULD use short-lived `feat/`, `fix/`, `docs/`, `chore/`, or `test/` prefixes plus kebab-case scope. Commit messages and PR titles MUST use Conventional Commit form and MUST be enforceable by CI checks. PR descriptions MUST preserve the repository template and fill type, verification, and scope fields. Conventional Commit scopes SHOULD remain flexible and MUST NOT require a fixed package-scope list.
(Previously: P8-S3a documented naming policy without CI-enforceable commit or PR-title checks.)

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
(Previously: PR policy required Conventional Commit squash titles but not PR-title CI validation.)

#### Scenario: PR meets gates

- GIVEN a PR targets trunk
- WHEN it reaches `main` through a PR, has one `type:*` label when labels are used, completes the template, passes CI, and is reviewable
- THEN it MAY be squash-merged with a Conventional Commit title

#### Scenario: PR title fails governance check

- GIVEN a PR title is not a valid Conventional Commit squash-title candidate
- WHEN the `pull_request` workflow runs
- THEN CI MUST fail the PR-title governance check
- AND the PR MUST NOT be merge-ready

### Requirement: Automation Deferral

P8-S3c MUST replace automation deferral with CI-enforceable Conventional Commit validation for commit messages and PR titles. Local hooks MAY remain optional and MUST NOT be required for compliance. `semantic-release` MUST NOT be added in P8. Automated versioning, real publishing, and release artifact publication MUST remain out of scope.
(Previously: P8-S3a deferred commitlint and PR-title workflow to future P8-S3c.)

Implementation uses root `commitlint.config.cjs`, `@commitlint/cli`, `@commitlint/config-conventional`, package script `lint:pr-title`, and `.github/workflows/pr-title.yml`. The workflow writes the PR title to a temporary file and runs `pnpm commitlint --edit <file>`.

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
(Previously: P8-S3a rollback covered docs and release checks because governance automation was deferred.)

#### Scenario: Remote mutation needs confirmation

- GIVEN a task would change remote branches, default branch, protections, tags, or publish channels
- WHEN P8-S3c is applied
- THEN the task MUST remain documented and gated
- AND MUST NOT run automatically
