---
title: Mastra workflows — docs + reference
description: Load when building Mastra workflows with steps, suspend/resume, or snapshots.
parent: mastra
impact: HIGH
impactDescription: Doc URLs and reference API for @mastra/core workflows
tags: mastra, workflows, suspend, hitl, snapshots
---

# Mastra workflows — docs & reference index

**Current MDE runtime:** inspect `src/mastra/index.ts` for registered workflows and `src/mastra/workflows/` for their actual steps. The Next.js / CopilotKit runtime already uses in-process Mastra agents. Do not scaffold a second workflow runner or assume an older `Roberto` approval flow is required. A supported suspend/resume feature may implement optional **user confirmation** or genuine recovery, but it cannot impose Phase A partner, property-ownership, event-publication or viewing business gates. Check the installed Mastra and AG-UI adapter APIs before using any example.

**Lookup order for MDE code:** check `package.json` / lockfile and installed `node_modules/@mastra/*/dist/docs/` → `assets/SOURCE_MAP.json` plus installed TypeScript declarations/source → version-matched official docs → optional [`mcp-docs-lookup.md`](mcp-docs-lookup.md) / `mastraDocs` for supplementary research → [`links.md`](../links.md) as a navigation index. A current remote example is not proof that the installed API supports it.

---

## Concepts (docs — Supatabs)

| Topic | URL | mdeai |
| --- | --- | --- |
| Agents (when to use workflows) | https://mastra.ai/docs/agents/overview | Open-ended → agent; predetermined → workflow |
| Workflows overview | https://mastra.ai/docs/workflows/overview | EVP event ingest DAG |
| Workflow state | https://mastra.ai/docs/workflows/workflow-state | Step I/O + shared state |
| Control flow | https://mastra.ai/docs/workflows/control-flow | `.then`, `.branch`, `.parallel` |
| Agents & tools in workflows | https://mastra.ai/docs/workflows/agents-and-tools | Agent steps |
| Snapshots | https://mastra.ai/docs/workflows/snapshots | Persisted suspend state |
| Suspend & resume | https://mastra.ai/docs/workflows/suspend-and-resume | Version-verified durable resume/optional user confirmation; never Phase A business approvals |
| Human-in-the-loop | https://mastra.ai/docs/workflows/human-in-the-loop | HITL patterns |
| Time travel | https://mastra.ai/docs/workflows/time-travel | Debug / replay |
| Error handling | https://mastra.ai/docs/workflows/error-handling | Retries, fallbacks |
| Scheduled workflows | https://mastra.ai/docs/workflows/scheduled-workflows | Cron-style |

**Streaming:** [workflow streaming](https://mastra.ai/docs/streaming/workflow-streaming) · **Deploy:** [workflow runners](https://mastra.ai/docs/deployment/workflow-runners)

---

## Reference API (`reference/workflows/`)

Index via MCP: `mastraDocs` path `reference/workflows/`

| API | URL | Maps to doc |
| --- | --- | --- |
| **`Workflow` class** | https://mastra.ai/reference/workflows/workflow | [overview](https://mastra.ai/docs/workflows/overview) |
| **`Step`** | https://mastra.ai/reference/workflows/step | control flow |
| **`Run`** | https://mastra.ai/reference/workflows/run | execution instance |
| Workflow state reader | https://mastra.ai/reference/workflows/workflow-state-reader | [snapshots](https://mastra.ai/docs/workflows/snapshots) · [suspend & resume](https://mastra.ai/docs/workflows/suspend-and-resume) |

### Workflow methods (`reference/workflows/workflow-methods/`)

| Method | URL | Doc |
| --- | --- | --- |
| `.then()` | https://mastra.ai/reference/workflows/workflow-methods/then | [control flow](https://mastra.ai/docs/workflows/control-flow) |
| `.branch()` | https://mastra.ai/reference/workflows/workflow-methods/branch | control flow |
| `.parallel()` | https://mastra.ai/reference/workflows/workflow-methods/parallel | control flow |
| `.foreach()` | https://mastra.ai/reference/workflows/workflow-methods/foreach | control flow |
| `.dowhile()` / `.dountil()` | https://mastra.ai/reference/workflows/workflow-methods/dowhile | control flow |
| `.map()` | https://mastra.ai/reference/workflows/workflow-methods/map | control flow |
| `.commit()` | https://mastra.ai/reference/workflows/workflow-methods/commit | overview |
| `.createRun()` | https://mastra.ai/reference/workflows/workflow-methods/create-run | overview |
| `.sleep()` | https://mastra.ai/reference/workflows/workflow-methods/sleep | [suspend & resume § sleep](https://mastra.ai/docs/workflows/suspend-and-resume) |
| `.sleepUntil()` | https://mastra.ai/reference/workflows/workflow-methods/sleepUntil | suspend & resume |

### Run methods (`reference/workflows/run-methods/`)

| Method | URL | Doc |
| --- | --- | --- |
| `.start()` | https://mastra.ai/reference/workflows/run-methods/start | overview |
| `.startAsync()` | https://mastra.ai/reference/workflows/run-methods/startAsync | overview |
| **`.resume()`** | https://mastra.ai/reference/workflows/run-methods/resume | [suspend & resume](https://mastra.ai/docs/workflows/suspend-and-resume) |
| `.cancel()` | https://mastra.ai/reference/workflows/run-methods/cancel | error handling |
| `.restart()` | https://mastra.ai/reference/workflows/run-methods/restart | error handling |
| **`.timeTravel()`** | https://mastra.ai/reference/workflows/run-methods/timeTravel | [time travel](https://mastra.ai/docs/workflows/time-travel) |

**Note:** There is **no** `reference/workflows/suspend-and-resume` page — suspend/resume is documented under `docs/workflows/suspend-and-resume` and implemented via step `suspend()` + run `.resume()`.

---

## MCP fetch examples

```json
{
  "paths": [
    "docs/workflows/overview",
    "docs/workflows/suspend-and-resume",
    "docs/workflows/snapshots",
    "reference/workflows/workflow",
    "reference/workflows/workflow-state-reader",
    "reference/workflows/run-methods/resume"
  ]
}
```

Package: `@mastra/core` — use `readMastraDocs` with `projectPath` set to the absolute path of the current checkout root.

---

## mdeai pointers

| Artifact | Path |
| --- | --- |
| Event discovery workflows (planned) | `tasks/events/EVP-022-mvp-event-discovery-workflow.md` |
| Mastra PRD workflows | `tasks/prompts/mastra/` |
| CopilotKit HITL (UI mirror of suspend) | `copilotkit` skill |
| v1 workflow migration | https://mastra.ai/guides/migrations/upgrade-to-v1/workflows |
