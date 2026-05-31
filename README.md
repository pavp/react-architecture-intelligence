<div align="center">

# React Architecture Intelligence

**Architecture review memory for React codebases.**  
RAI analyzes React structure, surfaces architectural findings, and explains evidence without rewriting your source or inventing intent.

<p>
<a href="https://github.com/pavp/react-architecture-intelligence/releases"><img src="https://img.shields.io/github/v/release/pavp/react-architecture-intelligence" alt="Release"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
<img src="https://img.shields.io/badge/Node-22+-339933?logo=node.js&logoColor=white" alt="Node 22+">
<img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="Platform">
</p>

</div>

---

## What it does

RAI is not a style linter. It is a local architecture intelligence tool for React teams.

**Before**: you review a pull request and manually notice repeated components, render coupling, boundary drift, or hook topology risk.

**After**: RAI gives you deterministic findings, stable fingerprints, grounded explanations, and MCP tools so agents can discuss architecture using measured code facts.

RAI currently detects and explains:

| Signal | What it helps inspect |
|--------|------------------------|
| Shared extraction | Components with similar structure that may deserve extraction review. |
| Render coupling | Components with broad downstream render impact. |
| Hook topology | Hooks with notable dependency/call graph shape. |
| Boundary violations | Edges that cross configured architecture conventions. |
| Next.js adapter metrics | Client/server, route, and topology signals from Next projects. |

## Quick path

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

`rai install` can auto-detect supported agent configs in your project or home directory. Start with dry-run so you can review the MCP config and instruction-file writes:

```bash
rai install . --dry-run
```

Apply the detected setup automatically after review:

```bash
rai install . --yes
```

RAI is not OpenCode-only. Supported installer targets: `opencode`, `claude-code`, `codex`, and `copilot`.

| Agent | Preview install | Apply install | Writes |
|-------|-----------------|---------------|--------|
| OpenCode | `rai install . --platform opencode --dry-run` | `rai install . --platform opencode --yes` | `opencode.json` + `AGENTS.md` |
| Claude Code | `rai install . --platform claude-code --dry-run` | `rai install . --platform claude-code --yes` | `.mcp.json` + `CLAUDE.md` |
| Codex | `rai install . --platform codex --dry-run` | `rai install . --platform codex --yes` | `~/.codex/config.toml` + `AGENTS.md` |
| Copilot | `rai install . --platform copilot --dry-run` | `rai install . --platform copilot --yes` | `.vscode/mcp.json` + `.github/copilot-instructions.md` |

Install multiple agents in one pass:

```bash
rai install . --platform opencode,claude-code,codex --dry-run
rai install . --platform opencode,claude-code,codex --yes
```

Use `--no-instructions` when you only want MCP config and do not want RAI to update agent instruction files.

## Example explain output

```text
RAI explain: src/components/Button.tsx

1. react/render-coupling (warn, active)
   RAI found render-coupling evidence for react/render-coupling.
   Why it matters: This finding points to code structure RAI measured directly.
   Fingerprint: 4f2a...
   What to inspect first: Dashboard in src/components/Button.tsx, 8 downstream render links, 5 direct children, render tree depth: 3
   Evidence terms: component, directChildren, fanIn, fanOut, kind, reachableDepth
   Limits: Do not assume shared ownership, intent, root cause, or safe remediation from this finding alone.
```

Use human output for review. Use `--json` when you need raw finding data plus explanation envelope:

```bash
rai explain src/components/Button.tsx --json
```

## Core principles

| Principle | Meaning |
|-----------|---------|
| Code is source of truth | Findings come from parsed source, graph facts, and analyzer evidence. |
| Human text is presentation-only | Explanations summarize evidence; they do not change facts. |
| No invented intent | RAI does not infer owner intent, root cause, or safest fix. |
| Feedback is explicit | Memory changes only through explicit feedback tools. |
| Core stays framework-agnostic | React/Next details live in adapters, not `@rai/core`. |

## How to read findings

1. Start with summary and severity.
2. Open **What to inspect first** files/spans.
3. Check evidence terms and raw JSON when needed.
4. Decide as human reviewer; do not treat finding as automatic remediation advice.

| Field | Meaning |
|-------|---------|
| Summary | Short description of measured code structure. |
| Why it matters | Why this shape may deserve inspection. |
| What to inspect first | Files/spans and measured values tied to evidence. |
| Evidence terms | Structured evidence keys grounding explanation text. |
| Limits | What RAI is not allowed to assume. |
| Fingerprint | Stable handle for follow-up, memory, and MCP tools. |

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
| `cosine` | Structural similarity score; higher means more alike. |
| `propOverlap` | Ratio of props shared by compared components. |
| `hookOverlap` | Ratio of hook calls shared by compared components or hooks. |
| `sharedSurface` | Props present across all compared instances. |
| `span` | Source range and syntax path tied to evidence. |
| `fanIn` / `fanOut` | Incoming and outgoing render/call links. |
| `reachableDepth` | Longest reachable render/dependency distance. |
| `groundingFields` | Evidence keys used to build explanation text. |
| `diagnostic` | Analyzer or adapter execution note; not a finding. |

## Current limitations

- RAI explains findings it already measured; it does not infer owner intent, root cause, or safe remediation.
- `rai explain <file>` matches primary spans and known nested evidence references; human text is presentation-only.
- Release publishing is manual and maintainer-approved.
- P10+ will expand React pattern intelligence beyond current analyzer signals.
