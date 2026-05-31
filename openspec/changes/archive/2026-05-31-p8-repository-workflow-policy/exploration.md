## Exploration: P8-S3a — Repository Workflow and Release Policy

### Current State

The repository currently uses `feat/rai-mvp-p0-p3` as the only remote branch and remote HEAD. Local `main` exists but has no remote tracking branch, and several stale local branches track deleted remote branches. No local or remote release tags exist.

Release work is intentionally dry-run only today. P8-S1 and P8-S2 are complete in `openspec/changes/p8-single-binary-distribution/`; P8-S3 remains blocked until maintainer-owned release channels, permissions, secrets, and policy exist. `.goreleaser.yaml` has `release.disable: true`, Homebrew/Scoop owners are `DRY_RUN_ONLY`, and no `.github/workflows/release.yml` exists.

CI runs on pull requests and pushes to `feat/rai-mvp-p0-p3` only. Existing docs already establish review constraints: Conventional Commits, squash merge, every PR links an approved issue and has exactly one `type:*` label, split planned PRs above the review budget, and prefer feature-branch-chain for large integrated work. These are workflow fragments, not a full release branch/tag policy.

### Affected Areas

- `docs/STATUS.md` — canonical current branch and P8/P8-S3 state; should point to the adopted workflow policy once created.
- `docs/ROADMAP.md` — canonical P8 next-slice wording; should show P8-S3a before publish gates.
- `docs/release-maintainer-checklist.md` — already has setup checklist but only says tag policy must be documented; should link or embed exact branch/tag gate once policy exists.
- `.github/workflows/ci.yml` — currently gates PRs and pushes to `feat/rai-mvp-p0-p3`; future policy likely needs canonical trunk branch CI and tag/release workflow separation.
- `.goreleaser.yaml` — currently dry-run disabled release config; P8-S3 must only enable after branch/tag policy and maintainer setup are satisfied.
- `packages/cli/src/release-config.ts` and `packages/cli/src/release-config.test.ts` — current dry-run validator rejects real publish workflow shape but does not know branch/tag policy yet.
- `openspec/changes/p8-single-binary-distribution/tasks.md` — P8-S3 tasks should depend on this policy or reference it before real publish activation.
- `CLAUDE.md` / `AGENTS.md` — stable handoff currently says main working branch is `feat/rai-mvp-p0-p3`; after policy adoption, these should avoid contradicting canonical workflow docs.

### Approaches

1. **Simple trunk-based policy** — Promote one canonical trunk branch and use short-lived issue/feature branches plus signed version tags for releases.
   - Pros: Fits repo scale and single remote branch reality; lower process overhead; clear gates for P8-S3; works well with squash merge and small PRs; avoids long-lived release branch drift.
   - Cons: Requires a one-time branch normalization decision because current remote trunk is named `feat/rai-mvp-p0-p3`; release hotfixes need disciplined patch tags or temporary short-lived branches.
   - Effort: Low/Medium

2. **GitFlow** — Add long-lived `main`, `develop`, `release/*`, and `hotfix/*` branches.
   - Pros: Familiar release branch vocabulary; can isolate release stabilization from ongoing work.
   - Cons: Heavy for a repo with one remote branch and no published releases; adds merge/rebase overhead; increases stale branch risk; delays P8-S3 gates behind branch-model migration instead of solving release safety.
   - Effort: Medium/High

3. **Status quo plus tag checklist** — Keep `feat/rai-mvp-p0-p3` as trunk and only document tag rules for releases.
   - Pros: Minimal diff and no branch migration.
   - Cons: Leaves confusing trunk name in release policy; does not resolve stale local branch/remote branch reality; weak long-term signal for contributors and automation.
   - Effort: Low

### Recommendation

Use a simple trunk-based policy. Name the canonical trunk explicitly and keep release work tag-driven: short-lived branches target trunk, CI must pass before squash merge, release publish workflows only run from protected `vX.Y.Z` tags created from trunk commits, and GoReleaser remains disabled until P8-S3 gates verify maintainer setup. This fits the current repository better than GitFlow because there is no active multi-release maintenance stream, no remote `main`, no existing tags, and P8-S3 needs clear publish gates more than long-lived branch ceremony.

Recommended P8-S3a implementation shape:

1. Add a concise repository workflow policy doc with branch roles, PR gates, tag format, release permissions, rollback/hotfix path, and non-goals.
2. Update release maintainer checklist/status/roadmap to reference P8-S3a as prerequisite for P8-S3 real publish gates.
3. Add validator tests/checks so real publish workflow is rejected unless policy exists and tag/branch gates are encoded.
4. Defer actual publish enablement until maintainer confirms tap, bucket, secrets, permissions, and protected tag/branch settings.

### Risks

- Branch rename/migration can disrupt current local/remote setup if performed inside the same PR; keep P8-S3a policy-first and treat remote branch migration as maintainer action unless explicitly authorized.
- GitHub branch/tag protection settings cannot be fully enforced from repository files alone; docs and validator can require workflow shape, but maintainer must configure protected branches/tags in GitHub.
- Release validator can overfit markdown snippets; prefer deterministic policy file checks plus workflow YAML checks when implementing.
- Existing unrelated local changes (`CLAUDE.md`, `openspec/config.yaml`, untracked `.atl/`) must stay untouched.

### Ready for Proposal

Yes. Tell the orchestrator to run `sdd-propose` for `p8-repository-workflow-policy`, scoped to trunk-based repository workflow and release branch/tag gates only. Do not implement real P8-S3 publishing in this change.
