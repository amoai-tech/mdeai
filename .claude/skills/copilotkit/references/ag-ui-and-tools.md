# AG-UI and frontend tools

CopilotKit v2 uses AG-UI as the agent/user interaction transport. Treat text streaming, tool calls/results, and state snapshots/deltas as protocol contracts.

MDE-specific rule: CopilotKit tool/action names align to Mastra tool map keys. Verify `src/platform/copilot/mastra-tool-action-names.ts` and its tests before changing render/action registration.

When tool result envelopes or state change, test normalization plus the rendered browser path; protocol-shape tests alone do not prove UI behavior.
