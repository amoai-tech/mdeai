---
title: Mastra streaming — docs + reference
description: Load when debugging SSE, tool-call streaming, or AG-UI event bridges from Mastra agents.
parent: mastra
impact: HIGH
impactDescription: Doc URLs and reference API for agent/workflow/tool streaming
tags: mastra, streaming, sse, events, tool-streaming
---

# Mastra streaming — docs & reference index

**Current MDE runtime:** the browser calls same-origin `/api/copilotkit` via `src/app/api/copilotkit/[[...path]]/route.ts` and the existing `LoggingMastraAgent` / `@ag-ui/mastra` adapter—not a standalone `/chat` SSE server. Compare Mastra stream chunks against the **installed** AG-UI adapter and CopilotKit version before copying examples from [Mastra streaming](https://mastra.ai/docs/streaming/events). Do not add a parallel stream, map-state system, or background-task manager without an explicit task.

**Lookup order for MDE code:** check `package.json` / lockfile and installed `node_modules/@mastra/*/dist/docs/` → `assets/SOURCE_MAP.json` plus installed TypeScript declarations/source → version-matched official docs → optional [`mcp-docs-lookup.md`](mcp-docs-lookup.md) / `mastraDocs` for supplementary research → [`links.md`](../links.md) as a navigation index. A current remote example is not proof that the installed API supports it.

---

## Completion, Stop and failure truth (SAN-1605 compatibility target)

A streamed sentence or a UI confirmation is **not** proof that an action succeeded. Follow the existing `src/mastra/copilotkit/logging-mastra-agent.ts` and `src/mastra/lib/mastra-telemetry.ts` result/error categories rather than inventing new result or audit owners:

- **Completed:** a successful AG-UI run may finish rendering; a consequential action is successful only after the existing backend/RPC confirms its durable commit.
- **Failed:** preserve agent/tool errors as errors; no false positive cards, booking, payment or event-save confirmation.
- **Timed out:** label timeout distinctly, verify no late/duplicate side effect, and use existing idempotency for any retry.
- **Client aborted / Stop:** distinguish deliberate unsubscribe/cancel from server failure and normal finish. Stop should terminate the intended run, not another thread, and should never say “saved” when no commit occurred. If a write **already committed** before cancellation, verify and report that actual result honestly.

**Compatibility proof under SAN-1605:** exercise run start → text/tool events → tool result → successful finish; tool error → failed finish; cancel/Stop → aborted finish without a false success; reconnect/replay; request timeout; and a side-effecting tool with retry. Assert the real UI state and independent persisted row counts, not just event types. Check installed `@ag-ui/mastra`, `@ag-ui/client`, and CopilotKit event ordering/cancellation contracts before migration. These cases are **not certified by this skills update**.

## Concepts (docs — Supatabs)

| Topic | URL | mdeai |
| --- | --- | --- |
| Overview | https://mastra.ai/docs/streaming/overview | `.stream()` vs `.streamLegacy()`; agent vs workflow streams |
| Events | https://mastra.ai/docs/streaming/events | `start`, `text-delta`, `tool-call`, `tool-result`, workflow lifecycle |
| Tool streaming | https://mastra.ai/docs/streaming/tool-streaming | `context.writer`, transient chunks, tool lifecycle hooks |
| Workflow streaming | https://mastra.ai/docs/streaming/workflow-streaming | Step `writer`, `resumeStream`, pipe agent → step |
| Background task streaming | https://mastra.ai/docs/streaming/background-task-streaming | `backgroundTaskManager.stream()` — needs config flag |

**Related:** [CopilotKit + Mastra guide](https://mastra.ai/guides/build-your-ui/copilotkit) · [background tasks](https://mastra.ai/docs/agents/background-tasks) · [workflows index](workflows.md)

---

## Reference API (`reference/streaming/`)

Index via MCP: `mastraDocs` path `reference/streaming/`

| API | URL | Maps to doc |
| --- | --- | --- |
| **Chunk types** | https://mastra.ai/reference/streaming/ChunkType | [events](https://mastra.ai/docs/streaming/events) · [background tasks](https://mastra.ai/docs/streaming/background-task-streaming) |

### Agents (`reference/streaming/agents/`)

| Method | URL | Doc |
| --- | --- | --- |
| **`Agent.stream()`** | https://mastra.ai/reference/streaming/agents/stream | [overview](https://mastra.ai/docs/streaming/overview) |
| **`MastraModelOutput`** | https://mastra.ai/reference/streaming/agents/MastraModelOutput | output shape · `textStream`, `usage`, `finishReason` |
| **`streamLegacy()`** | https://mastra.ai/reference/streaming/agents/streamLegacy | AI SDK v4 / V1 models |
| **`streamUntilIdle()`** | https://mastra.ai/reference/streaming/agents/streamUntilIdle | [background task streaming](https://mastra.ai/docs/streaming/background-task-streaming) |

Also on agent class index: [`.stream()` in agents API](https://mastra.ai/reference/agents/agent) · [generate vs stream](https://mastra.ai/reference/agents/generate)

### Workflows (`reference/streaming/workflows/`)

| Method | URL | Doc |
| --- | --- | --- |
| **`Run.stream()`** | https://mastra.ai/reference/streaming/workflows/stream | [overview](https://mastra.ai/docs/streaming/overview) · [workflow streaming](https://mastra.ai/docs/streaming/workflow-streaming) |
| **`Run.resumeStream()`** | https://mastra.ai/reference/streaming/workflows/resumeStream | suspended workflow + [snapshots](https://mastra.ai/docs/workflows/snapshots) |
| **`Run.observeStream()`** | https://mastra.ai/reference/streaming/workflows/observeStream | attach to in-flight run |
| **`Run.timeTravelStream()`** | https://mastra.ai/reference/streaming/workflows/timeTravelStream | [time travel](https://mastra.ai/docs/workflows/time-travel) |

---

## Event cheat sheet (agents)

From [streaming/events](https://mastra.ai/docs/streaming/events):

| Event | When |
| --- | --- |
| `start` | Run begins |
| `text-delta` | LLM token chunk |
| `tool-call` | Tool name + args chosen |
| `tool-result` | Tool return value |
| `step-start` / `step-finish` | Step boundaries |
| `finish` | Run complete + usage |

**Network / supervisor** (Phase 2 defer): `routing-agent-*`, `agent-execution-*`, `workflow-execution-*` — see events doc.

---

## MCP fetch examples

```json
{
  "paths": [
    "docs/streaming/overview",
    "docs/streaming/events",
    "docs/streaming/tool-streaming",
    "reference/streaming/agents/stream",
    "reference/streaming/agents/MastraModelOutput",
    "reference/streaming/workflows/stream",
    "reference/streaming/ChunkType"
  ]
}
```

Package: `@mastra/core` — use `readMastraDocs` with `projectPath` set to the absolute path of the current checkout root.

---

## mdeai pointers

| Artifact | Path |
| --- | --- |
| CopilotKit runtime (AG-UI bridge) | `src/app/api/copilotkit/[[...path]]/route.ts` |
| CopilotKit integration skill | `copilotkit` → `references/mastra-bridge.md` |
| Tool definitions (writer hooks) | `src/mastra/tools/**` |
| AI SDK v5 bridge | `toAISdkV5Stream()` from `@mastra/ai-sdk` — see [overview](https://mastra.ai/docs/streaming/overview) |
