# AG-UI and frontend tools — trace the existing contract

Read for missing tool cards, partial JSON, duplicate actions, streaming failures, Stop/Retry, shared-state drift, or empty generative UI. Follow `mastra-bridge.md` when the failure may be between the runtime and Mastra; use `native-generative-ui.md` for `render_ui` catalogs and Surfaces. **Do not add another transport or renderer to diagnose this path.**

## 1. Verify the actual versions and owners

- Inspect installed `@copilotkit/react-core`, `@copilotkit/runtime`, `@ag-ui/core` and `@ag-ui/mastra` types/source before using version-sensitive API examples.
- Runtime entry: `src/app/api/copilotkit/[[...path]]/route.ts` → `src/lib/copilotkit-transport.ts`. Preserve same-origin single-endpoint mode, authentication, resource/thread ownership, rate limiting and telemetry.
- Frontend: `src/components/copilot/search-tool-renders.tsx`, the existing route-specific providers and `src/platform/copilot/mastra-tool-action-names.ts`. A `useRenderTool` name must match the **Mastra tool-map key**, not an internal `createTool()` identifier.

## 2. Follow one run in order, then fix only the failing boundary

| Check | Evidence to collect | If missing |
| --- | --- | --- |
| Browser request | Correct `/api/copilotkit` URL, agent, scoped thread/run, authenticated session, HTTP status | Inspect provider props, route, auth, session or allowlist; do not bypass security |
| Runtime → Mastra | Agent is registered; per-run context and frontend tools reach the adapter | Read `mastra-bridge.md`, inspect exact `LoggingMastraAgent` input/output |
| Tool invocation | Ordered `TOOL_CALL_START`, streamed `TOOL_CALL_ARGS`, `TOOL_CALL_END` (or version-matched chunk form) with correct tool name and call ID | Inspect registration, event mapping and adapter; don't rewrite search logic yet |
| Tool completion | A tool-result message associated with that call ID, with a valid payload | Diagnose backend tool outcome and serialized result separately from tool arguments |
| Browser render | Matching `useRenderTool` registration, status and `result`, plus visible card/map/details | Diagnose result parsing, props and renderer/fallback rather than assuming the agent failed |
| Native UI only | `render_ui` was actually provided to the model and Inspector reports accepted component/surface operations | Follow `native-generative-ui.md` / Inspector, not legacy `a2ui: {}` middleware |

**Critical distinctions:**

- `args` are the tool's **input arguments**; `result` is its **completed output**. Do not read rental search rows or event ticket tiers from `args` when the tool returned them in `result`. CopilotKit v2 tool rendering passes completed tool-message text to `result`; validate/parse its actual envelope before showing cards. Keep error, empty and partial-result fallbacks honest.
- `TOOL_CALL_ARGS` deltas may be incomplete JSON. AG-UI closes an argument stream at `TOOL_CALL_END`, but closure does **not** prove JSON validity. Never execute a protected action based on partial arguments; parse, validate and reauthorize server-side after completion. UI-only progress previews must not commit writes.
- Match call IDs and run/thread IDs; don't let an older run replace a newer search result, a canceled run mutate state later, or one user's thread appear in another session. Handle `STATE_SNAPSHOT`, `STATE_DELTA`, message snapshots and run failures using the actual installed version's reducer.
- Stop, disconnect, retry and refresh are different events. Verify cancellation propagation and persisted state; assume neither rollback nor exactly-once execution without evidence. Idempotent domain RPCs own write correctness.
- Treat model text and tool payloads as untrusted data. Validate shape, bound output size, sanitize diagnostics, and never log bearer tokens, private listing data or full prompt contents into PRs.

## 3. Use official Inspector in local/authorized QA

Open [CopilotKit Inspector](https://docs.copilotkit.ai/inspector) to inspect **Conversation** (tool calls), **event timeline / AG-UI Events** (stream), and **Generative UI** (Catalog, Surfaces and Prompt) when configured. If the Surface shows its fallback, inspect **Rejected operations** and component props before changing UI code. A missing component in **Catalog** means it was not advertised to the model; a missing function handler must be fixed at registration.

Inspector and raw event streams may contain sensitive runtime data. Use only authorized development/QA sessions; redact IDs and secrets before sharing evidence. Never expose a debug event endpoint publicly just to troubleshoot.

## 4. Focused proof matrix

1. Mastra returns real results but no card → verify exact tool-map key, completed result envelope, `useRenderTool` registration, browser DOM.
2. Partial/malformed tool JSON → no protected action and no invented data; safe error/empty UI.
3. No results → empty cards and pins consistently; retry preserves current query.
4. Search A finishes after Search B → B remains authoritative; Stop/Retry does not replay stale or duplicate side effects.
5. Two signed-in users / guest → no cross-user thread, data or tool-result leakage.
6. Native UI rejected/unknown component → Inspector reason plus existing `useRenderTool` or page fallback; 390px/keyboard render remains usable.

Run the smallest relevant contract/unit tests and one **real** AG-UI event-to-browser trace when changing visible behavior. A wiring-only CLI check, JSON schema test, or agent's final answer is insufficient.

**Sources:** [AG-UI 1.0 tool calls](https://docs.ag-ui.com/spec/1.0/events/tool-calls), [AG-UI architecture](https://docs.ag-ui.com/spec/1.0/architecture), [CopilotKit tool rendering](https://docs.copilotkit.ai/generative-ui/tool-rendering), [Inspector](https://docs.copilotkit.ai/inspector). Treat these as references; installed types/source define MDE's current behavior.
