# CopilotKit ↔ Mastra bridge — failure-isolation checklist

MDE reuses `@ag-ui/mastra` behind the **existing** CopilotKit runtime. CopilotKit owns the browser/provider, runtime transport, events and tool renderer; `mastra` owns agent definitions, tool implementations, workflows, memory, persistence and Mastra-side HITL. Do not create a second agent service, custom chat stream, or duplicate business action.

## Diagnose from browser to model and back

1. **Pin the implementation.** Read `package.json`, lockfile and installed `@ag-ui/mastra` / `@mastra/*` sources. Read `src/app/api/copilotkit/[[...path]]/route.ts`, `src/lib/copilotkit-transport.ts` and the current agent registry. Do not transplant examples from a different version or hosted Intelligence.
2. **Verify the request boundary.** Record correct same-origin URL, expected agent ID, HTTP response, request/session context and user-scoped thread/run ID. Inspect auth, allowlist, rate limit and resource ownership without logging credentials. Browser-supplied user or thread IDs are not authorization.
3. **Inspect the real adapter.** Read `src/mastra/copilotkit/logging-mastra-agent.ts` and `super.run(input)`. Verify input sanitization does not accidentally drop valid per-run `tools`, `context`, `threadId` or `runId`. Confirm by tracing the **actual** agent invocation; reading wrapper code alone cannot prove the forwarded model request.
4. **Check tool exposure.** Compare `src/platform/copilot/mastra-tool-action-names.ts` with Mastra's registered tool-map keys and frontend `useRenderTool` / `useHumanInTheLoop` names. If `render_ui` is expected, prove the frontend catalog was sent, the tool was included in that run and the agent forwarded it to the model. No need for older A2UI middleware in native Components/Surfaces mode.
5. **Inspect the event stream.** Correlate the same run/call ID through AG-UI start, argument deltas, end, tool result and run finish/error. Distinguish agent failure, adapter event loss, frontend registration failure, and valid empty search results; use `ag-ui-and-tools.md`.
6. **Check user-visible result.** Render the **completed** tool result, not the invocation arguments. For missing rental cards, inspect `src/components/copilot/search-tool-renders.tsx` before editing search tools. Confirm current authorized result IDs, native Details/map, thread replay and fallback.
7. **Check interruption/recovery.** Test Stop, reload, resume/retry and concurrent runs. Do not assume Mastra `suspend()` implies supported CopilotKit `useInterrupt` events: MDE's documented tool-based `useHumanInTheLoop` remains the default until the actual adapter proves the interrupt protocol. Verify one real backend mutation and idempotency only when a write is genuinely in scope.

### Evidence-driven fix selection

| Observed symptom | Change only after proof |
| --- | --- |
| 401 / forbidden agent or thread | Correct existing runtime auth, agent allowlist or thread-owner contract; never turn it off |
| Mastra tool succeeds but frontend shows no card | Align existing tool-map name / completed result envelope / `useRenderTool` renderer |
| `render_ui` never reaches model | Repair only the demonstrated frontend-tools/context propagation boundary after exact-version inspection |
| Tool result arrives but card uses wrong fields | Validate `result` schema and hydration from existing authorized rows |
| Duplicate action after retry | Trace idempotent backend RPC and run/call correlation; never rely on frontend button disabling |
| Reload loses conversation or new search overwritten | Repair canonical thread replay and run ordering, not a parallel transcript store |

### Minimal verification

- Focused tests around the first broken boundary: agent/tool-map keys, wrapper input, event shape or renderer output.
- One captured authorized QA browser run showing request → tool execution → AG-UI result → rendered card, with identifiers redacted in shared evidence.
- Negative checks for missing/malformed result, unauthorized user/thread, Stop/retry and stale older responses when applicable.
- No launch-only property approvals, ownership paperwork, business eligibility, viewing or publishing gates during Phase A. Preserve authentication, isolation, auditability and idempotent/atomic writes.

**Sources:** [CopilotKit + Mastra tool-based HITL](https://docs.copilotkit.ai/mastra/human-in-the-loop/tool-based), [native Components transports](https://docs.copilotkit.ai/generative-ui/components/transports), [AG-UI 1.0 architecture](https://docs.ag-ui.com/spec/1.0/architecture). Check installed adapter code before claiming an integration supports a particular event.
