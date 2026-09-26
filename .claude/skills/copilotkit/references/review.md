# CopilotKit review invariants

## Source of truth

1. Changed MDE code and tests.
2. Installed `@copilotkit/*` and `@ag-ui/*` source/types.
3. Current official CopilotKit/AG-UI documentation.
4. Canonical `copilotkit/SKILL.md`.

## Review invariants

- Preserve verified CopilotKit v2 imports/runtime surfaces unless the PR proves an intentional migration.
- Preserve same-origin `/api/copilotkit`, auth, rate limits, telemetry, request context, and agent allowlists.
- Agent IDs and tool-map keys must resolve to registered Mastra agents/tools.
- Browser-supplied user, tenant, thread, run, page, or resource IDs are not authorization.
- Thread/connect/stop/cancel behavior must not cross user or tenant boundaries.
- Verify streaming, interrupts, HITL, and AG-UI/Mastra behavior against installed package APIs.
- Stable provider/runtime props must not remount and silently lose conversation state.

For v2 API/import findings, identify the exact changed API, restore the verified installed surface, run targeted CopilotKit tests, then `npm run typecheck`.
For identity/thread findings, require the smallest User A → User B denial proof.
