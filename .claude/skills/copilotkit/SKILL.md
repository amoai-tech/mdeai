---
name: copilotkit
description: >-
  Use for any MDE request clearly involving CopilotKit, including implementation, configuration, /api/copilotkit, CopilotKit v2 React hooks, generative UI, frontend tools/actions, shared agent state, AG-UI transport, runtime wiring, CLI verification, HITL, CopilotKit-to-Mastra bridges, and CopilotKit-specific bugs/errors/failures. A known CopilotKit failure stays with this domain owner rather than generic systematic-debugging.
metadata:
  mde-version: "2.0.0"
  upstream-commit: "8a7446186cd3e0d368ec885e61c5913f0918ef5d"
  verified-package: "@copilotkit/react-core 1.55.2 / @copilotkit/runtime 1.55.2"
---

# CopilotKit — official upstream + MDE overlay

## Source order

1. Inspect the installed MDE CopilotKit packages and current runtime/provider code.
2. Read the pinned official CopilotKit core skill in `references/official/copilotkit/SKILL.md`.
3. For wiring/debugging, also read `references/official/copilotkit-cli/SKILL.md` and run `npx copilotkit@4.10.0 verify --json` when safe and applicable.
4. Use current official CopilotKit/AG-UI docs or source when the pinned skill directs you there.
5. Apply the MDE-specific invariants below.

Do not answer volatile CopilotKit API questions from memory. Do not silently replace installed-version behavior with latest-main examples.

## Ownership

Own the browser-facing agent bridge: provider/hooks, same-origin runtime, AG-UI events, frontend tool/action registration, shared state, generative UI, and CopilotKit-visible failures. `mastra` owns agents/tools/workflows/memory/storage/HITL semantics. Product-domain skills own business invariants.
## Current MDE invariants

- MDE uses CopilotKit v2 React APIs from `@copilotkit/react-core/v2`.
- Browser traffic uses the same-origin `/api/copilotkit` runtime; do not switch to hosted Intelligence implicitly.
- Tool render/action names must match the Mastra tool-map key, not a `createTool()` id.
- Preserve auth, distributed rate limits, request context, telemetry, and agent allowlists on the runtime route.
- Treat AG-UI messages/events as the frontend-agent transport contract; do not create parallel ad-hoc chat state.
- Keep provider props stable across renders.

## Workflow

1. Classify the issue: wiring/runtime, React/provider, AG-UI/tool rendering, shared state, CLI verification, or Mastra bridge.
2. Use the official core/CLI skill as the default procedure and lookup guide.
3. Load only the matching MDE reference: `runtime-and-react.md`, `ag-ui-and-tools.md`, or `mastra-bridge.md`.
4. Reproduce before editing when debugging.
5. Keep the smallest safe contract change and hand Mastra-internal changes to `mastra`.
6. Prove the affected contract with targeted tests plus browser/stream evidence when user-visible behavior changed.

## Verification

At minimum verify the affected runtime URL, agent identity, version surface, tool/action mapping, auth/rate-limit behavior, AG-UI result/state handling, and rendered user path. A passing CopilotKit CLI wiring check does not prove tool execution, streaming order, state synchronization, or rendered generative UI; test those separately.

## References

- `upstream.yaml` — immutable source provenance and update policy
- `references/official/copilotkit/SKILL.md` — official vendor skill, pinned and read-only
- `references/official/copilotkit-cli/SKILL.md` — official CLI skill, pinned and read-only
- `references/runtime-and-react.md`
- `references/ag-ui-and-tools.md`
- `references/mastra-bridge.md`
- https://docs.copilotkit.ai/
- https://github.com/CopilotKit/CopilotKit
