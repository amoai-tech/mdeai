---
description: Verify CopilotKit v2 hygiene — exact aligned pins, /v2 surface only, agent name matches Mastra
allowed-tools: Bash, Read, Grep, Glob, Agent
---

# /copilotkit-check — CopilotKit v2 hygiene audit

Verify the invariants of the MDE CopilotKit + Mastra integration.

MDE is **v2-only**: React APIs come from `@copilotkit/react-core/v2` and the runtime route
targets `@copilotkit/runtime/v2`. The compatibility `<CopilotKit>` export and the bare
`@copilotkit/runtime` adapter are legacy boundaries being removed by SAN-1357 — they are
**not** the target architecture.

## Invariants

1. **Exact, aligned pins** in the root `package.json`: `@copilotkit/react-core` and
   `@copilotkit/runtime` are the same exact version (no `^`, `~`, `>=`, `latest`, `*`).
   The certified matrix is recorded by SAN-1301 — read it from `package.json`, never hard-code it.
2. **Approved v2 surface only** — `@copilotkit/react-core/v2` and `@copilotkit/runtime/v2`.
   The full-rewrite line (`@copilotkit/react`, `@copilotkit/core`, `@copilotkit/agent`,
   `@copilotkit/sdk-js`) must have 0 matches.
3. **Legacy boundaries are inventory, not violations.** Report how many provider boundaries
   still use `<CopilotKit>` and whether the route still imports the bare-runtime adapter.
   SAN-1357 removes them; do not flag them as errors.
4. **Agent name matches a Mastra agent key** — parse from source, never assume.

## Workflow

1. `Read package.json` — list every `@copilotkit/*` entry and check exactness + core/runtime alignment.
2. `Grep -rn "from \"@copilotkit/" src supabase/functions` — flag bare `@copilotkit/react-core` and any full-rewrite package.
3. `Grep -rn "<CopilotKit" src` — inventory remaining compatibility boundaries (informational).
4. `Read src/app/api/copilotkit/[[...path]]/route.ts` — report whether it still imports the bare
   `@copilotkit/runtime` adapter or already uses `@copilotkit/runtime/v2`.
5. `Read` the provider that owns the active surface and extract its agent id (call it `X`).
6. `Read src/mastra/index.ts` — extract the keys of `agents: { … }` (call them `Y`).
7. Assert `X ∈ Y`, with line refs on mismatch.

## Expected output

```
## CopilotKit hygiene — <date>

| Check | Result | Detail |
|-------|--------|--------|
| exact aligned pins | ✅/❌ | "@copilotkit/react-core": "<v>", "@copilotkit/runtime": "<v>" |
| approved v2 surface | ✅/❌ | 0 full-rewrite imports found |
| legacy boundaries | ℹ️ | N provider(s) still on <CopilotKit>; route uses <bare runtime \| runtime/v2> |
| agent name matches Mastra | ✅/❌ | provider uses "<X>"; mastra/index.ts exports {...} |

(If any ❌, escalate to the copilotkit owner for line-level fixes.)
```

## Anti-patterns

- Do not hard-code a CopilotKit release in this check or anywhere else — read `package.json`.
- Do not flag `@copilotkit/react-core/v2`, `CopilotKitProvider` or `createCopilotRuntimeHandler` as
  violations; those are the target surface.
- Do not flag a remaining `<CopilotKit>` boundary as a bug — it is a tracked migration step (SAN-1357).
- Do not bump `@copilotkit/*` here — a matrix change is a deliberate, reviewed decision.
- Do not assume the agent name; always parse it from source to avoid stale memory.
