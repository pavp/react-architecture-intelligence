# Capability Spec: Memory Overlay

**Status**: Active (RFC 2119)  
**Origin**: change `wire-deferred-mvp-gaps` (2026-05-30)  
**Scope**: read-time severity clamping for presented findings.

## Purpose

Define the durable contract for memory overlay severity presentation. Severity clamps affect only presented severity and MUST NOT mutate stored findings.

## Severity Clamp Contract

`OverlayConfig` MAY expose a `severityMap` field:

```ts
type Severity = "info" | "warn" | "error";
type SeverityMap = Partial<Record<Severity, Severity>>;
```

The config schema MUST expose this map under `memory.severityMap`. The overlay receives `config.memory`, so placing the map outside `memory` MUST NOT be required by this capability.

The severity order is:

```text
info < warn < error
```

Config validation MUST reject mappings that raise severity. Examples:

| Mapping | Valid? | Reason |
|---------|--------|--------|
| `error -> warn` | yes | down-clamp |
| `warn -> info` | yes | down-clamp |
| `warn -> warn` | yes | identity |
| `info -> error` | no | upward raise |

## Overlay Behavior

The overlay MUST set `PresentedFinding.severity` to `cfg.severityMap[f.severityRaw]` when a mapping exists. If no mapping exists, severity MUST equal `f.severityRaw`.

The overlay MUST NOT mutate `f.severityRaw` or any other field on the source `Finding`. Stored severity remains raw CODE-derived finding data; the clamp is read-time presentation only.

## Integrity Invariants

- `severityRaw` remains immutable after finding creation.
- `severityMap` belongs to CONFIG/MEMORY presentation tier.
- Overlay returns a derived presentation object.
- No finding persistence write occurs as part of severity clamping.

## Scenarios Covered

| Scenario | Expected result |
|----------|-----------------|
| `severityRaw: "error"`, map `error -> warn` | presented severity is `warn`; raw remains `error` |
| no `severityMap` | presented severity equals raw severity |
| upward map `info -> error` | config validation rejects input |
| overlay called with valid map | source finding object is unchanged |

## References

- Implementation: `packages/core/src/memory/overlay.ts`, `packages/core/src/config/schema.ts`
- Tests: `packages/core/src/memory/overlay.test.ts`, `packages/core/src/config/resolve.test.ts`
- Source change: `wire-deferred-mvp-gaps`
