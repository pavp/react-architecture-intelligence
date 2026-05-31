<div align="center">

# React Architecture Intelligence

**Architecture review help for React teams.**  
RAI reads your React code, finds architecture patterns worth checking, and tells humans and coding agents where to look first.

<p>
<a href="https://github.com/pavp/react-architecture-intelligence/releases"><img src="https://img.shields.io/github/v/release/pavp/react-architecture-intelligence" alt="Release"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
<img src="https://img.shields.io/badge/Node-22+-339933?logo=node.js&logoColor=white" alt="Node 22+">
<img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="Platform">
</p>

</div>

---

## What it does

RAI helps answer a practical review question: “what architecture areas should we inspect before this grows?” It is not a formatter or a style linter.

**Before**: someone has to notice repeated components, tangled render paths, boundary drift, or risky hooks by hand.

**After**: RAI shows what it found, why it may matter, and where to start looking in code.

RAI currently detects and explains:

| Signal | What it means in review |
|--------|-------------------------|
| Shared extraction | “These components look alike. Is duplication intentional?” |
| Render coupling | “This component reaches a lot of UI. Changes here may spread.” |
| Hook topology | “This hook has a dependency shape worth checking.” |
| Boundary violations | “This import or relationship crosses a rule your repo configured.” |
| Next.js adapter metrics | “This route/client/server shape may need a closer look.” |

## Quick path

Install RAI, check the repo, run analysis, then explain one file.

### macOS / Linux with Homebrew

```bash
brew install pavp/tap/rai
rai doctor .
rai analyze .
rai explain src/components/Button.tsx
```

### Windows with Scoop

```powershell
scoop bucket add rai https://github.com/pavp/scoop-bucket
scoop install rai
rai doctor .
```

### Agent setup

`rai install` can set up supported coding agents for you. Start with dry-run so you can review the files before anything changes:

```bash
rai install . --dry-run
```

Apply the setup when it looks right:

```bash
rai install . --yes
```

Supported installer targets: `opencode`, `claude-code`, `codex`, and `copilot`.

| Agent | Preview install | Apply install | Writes |
|-------|-----------------|---------------|--------|
| OpenCode | `rai install . --platform opencode --dry-run` | `rai install . --platform opencode --yes` | `opencode.json` + `AGENTS.md` |
| Claude Code | `rai install . --platform claude-code --dry-run` | `rai install . --platform claude-code --yes` | `.mcp.json` + `CLAUDE.md` |
| Codex | `rai install . --platform codex --dry-run` | `rai install . --platform codex --yes` | `~/.codex/config.toml` + `AGENTS.md` |
| Copilot | `rai install . --platform copilot --dry-run` | `rai install . --platform copilot --yes` | `.vscode/mcp.json` + `.github/copilot-instructions.md` |

Homebrew note: `pavp/tap/rai` is Homebrew naming. It points to `pavp/homebrew-tap` and `Formula/rai.rb`.

Install multiple agents in one pass:

```bash
rai install . --platform opencode,claude-code,codex --dry-run
rai install . --platform opencode,claude-code,codex --yes
```

Use `--no-instructions` if you only want MCP config and do not want RAI to update agent instructions.

## How RAI works with agents

`rai install` gives your coding agent a new source of architecture evidence. The agent can ask RAI for findings and explanations, then use that evidence in its answer to you.

| Step | What happens |
|------|--------------|
| 1. RAI adds MCP config | Agent gets a `rai mcp <repo>` tool server. |
| 2. RAI adds instructions | Agent gets a small `RAI:BEGIN` / `RAI:END` usage guide. |
| 3. Agent asks RAI | Agent can request findings, explanations, graph nodes, drift, or refactor ideas. |
| 4. You decide | RAI gives evidence. You choose what to do next. |

The generated instructions keep the agent focused: use RAI for React architecture questions, not for generic file reading or unrelated tasks. RAI does not give the agent permission to change code by itself.

With RAI connected, your agent can answer questions like:

- What findings exist in this repo?
- Why did RAI flag this file?
- Which source span grounds this finding?
- Did architecture drift between snapshots?
- Is there a safe refactor proposal to inspect?

Example agent flow:

```text
You: What architecture issues changed in this PR?
Agent: calls RAI MCP tools → gets findings and evidence → explains what to inspect first.
You: Approve, reject, or ask for deeper analysis.
```

## Example explain output

```text
RAI explain: src/components/Button.tsx

1. react/render-coupling (warn, active)
   RAI found a component connected to many downstream render paths.
   Why it matters: a small change here may affect more UI than expected.
   Fingerprint: 4f2a...
   What to inspect first: Dashboard in src/components/Button.tsx, 8 downstream render links, 5 direct children, render tree depth: 3
   Evidence terms: component, directChildren, fanIn, fanOut, kind, reachableDepth
   Limits: RAI measured structure only. It does not know owner intent, root cause, or safest fix.
```

Use normal output when reading as a human. Use `--json` when another tool needs raw finding data:

```bash
rai explain src/components/Button.tsx --json
```

## Core principles

| Principle | Meaning |
|-----------|---------|
| Code first | Findings come from parsed source and graph facts. |
| Explanations stay honest | Human text summarizes evidence; it does not create new facts. |
| No mind-reading | RAI does not infer owner intent, root cause, or safest fix. |
| Human control | Feedback and code changes require explicit direction. |
| Clean core | React/Next details live in adapters, not `@rai/core`. |

## Safety model

| RAI can | RAI cannot |
|---------|------------|
| Read local code and produce findings. | Know why your team wrote the code. |
| Explain what evidence points to. | Decide the safest fix for you. |
| Give agents architecture tools. | Let agents change code automatically during analysis. |
| Suggest refactor ideas. | Record feedback unless you ask. |

## How to read findings

1. Read the summary.
2. Open **What to inspect first**.
3. Check evidence terms only if you need more detail.
4. Decide as reviewer; do not treat a finding as automatic fix advice.

| Field | Meaning |
|-------|---------|
| Summary | What RAI noticed. |
| Why it matters | Why you may want to inspect it. |
| What to inspect first | Where to start in code. |
| Evidence terms | Raw fields behind the explanation. |
| Limits | What RAI is not claiming. |
| Fingerprint | Stable ID for follow-up. |

## CLI commands

```bash
rai analyze [dir]                     # Print finding counts for a repo
rai explain <file> [--json]           # Explain findings connected to one file
rai install [dir] --platform opencode # Configure MCP integration
rai doctor [dir] --json               # Check runtime, build, MCP, and native deps
rai mcp [dir]                         # Serve MCP stdio tools
```

## Glossary

| Term | Meaning |
|------|---------|
| `cosine` | How similar two code shapes are. Higher means more alike. |
| `propOverlap` | How many props compared components share. |
| `hookOverlap` | How many hook calls compared components or hooks share. |
| `sharedSurface` | Props found across all compared instances. |
| `span` | File location tied to evidence. |
| `fanIn` / `fanOut` | How many links point in or out of a node. |
| `reachableDepth` | How far the render or dependency chain reaches. |
| `groundingFields` | Raw evidence fields used by the explanation. |
| `diagnostic` | Analyzer note; not a finding. |
