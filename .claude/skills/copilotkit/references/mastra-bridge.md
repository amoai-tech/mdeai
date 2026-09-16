# CopilotKit ↔ Mastra bridge

MDE uses `@ag-ui/mastra` adapters behind the CopilotKit runtime. CopilotKit owns transport/UI registration; `mastra` owns agent definitions, tool implementations, workflows, memory, persistence, and HITL semantics.

Before changing the bridge inspect:
- `src/mastra/copilotkit/logging-mastra-agent.ts`
- `src/platform/copilot/mastra-tool-action-names.ts`
- the `/api/copilotkit` route
- current Mastra agent registry/allowlist

Do not duplicate Mastra business/tool logic in React actions. Preserve request/tenant context and telemetry across the bridge.
