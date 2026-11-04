---
title: Mastra memory — docs + reference
description: Load when configuring Mastra Memory, working memory, threads, or storage. mdeapp Phase 1 = thread-scoped working memory only.
parent: mastra
impact: HIGH
impactDescription: Doc URLs and reference API for @mastra/memory
tags: mastra, memory, working-memory, observational-memory
---

# Mastra memory — docs & reference index

**Current technical scope (not a business eligibility rule):** MDE concierge uses thread-scoped working memory with the existing Zod schema and persistent storage. Do not silently enable a different memory architecture (observational memory, Mastra semantic recall, or shared-user threads) without a deliberate feature change and isolation tests. Phase A rental/viewing/event workflows remain available without business approval or verification prerequisites.

**Lookup order for MDE code:** check `package.json` / lockfile and installed `node_modules/@mastra/*/dist/docs/` → `assets/SOURCE_MAP.json` plus installed TypeScript declarations/source → version-matched official docs → optional [`mcp-docs-lookup.md`](mcp-docs-lookup.md) / `mastraDocs` for supplementary research → [`links.md`](../links.md) as a navigation index. A current remote example is not proof that the installed API supports it.

---

## Concepts (docs)

| Topic | URL | mdeai |
| --- | --- | --- |
| Agents (memory entry) | https://mastra.ai/docs/agents/overview | Working memory wired on `conciergeAgent` |
| Memory overview | https://mastra.ai/docs/memory/overview | Start here |
| Storage | https://mastra.ai/docs/memory/storage | LibSQL dev; Postgres prod path |
| Message history | https://mastra.ai/docs/memory/message-history | Thread turns |
| Working memory | https://mastra.ai/docs/memory/working-memory | **Phase 1 — primary** |
| Observational memory | https://mastra.ai/docs/memory/observational-memory | Phase 2 defer |
| Semantic recall | https://mastra.ai/docs/memory/semantic-recall | Phase 2 defer (use SQL hybrid in MIS) |
| Memory processors | https://mastra.ai/docs/memory/memory-processors | Optional filters |
| Multi-user threads | https://mastra.ai/docs/memory/multi-user-threads | Phase 2 defer |

---

## Reference API (`reference/memory/`)

Index via MCP: `mastraDocs` path `reference/memory/`

| API | URL | Maps to doc |
| --- | --- | --- |
| **`Memory` class** | https://mastra.ai/reference/memory/memory-class | [overview](https://mastra.ai/docs/memory/overview) |
| Observational memory config | https://mastra.ai/reference/memory/observational-memory | [observational-memory](https://mastra.ai/docs/memory/observational-memory) |
| `recall` tool (OM retrieval) | https://mastra.ai/reference/memory/recall | [observational-memory § retrieval](https://mastra.ai/docs/memory/observational-memory) |
| `createThread` | https://mastra.ai/reference/memory/createThread | [multi-user threads](https://mastra.ai/docs/memory/multi-user-threads) |
| `getThreadById` | https://mastra.ai/reference/memory/getThreadById | threads |
| `listThreads` | https://mastra.ai/reference/memory/listThreads | threads |
| `cloneThread` | https://mastra.ai/reference/memory/cloneThread | threads |
| `deleteMessages` | https://mastra.ai/reference/memory/deleteMessages | [message history](https://mastra.ai/docs/memory/message-history) |
| Clone utilities | https://mastra.ai/reference/memory/clone-utilities | threads |
| Client JS memory | https://mastra.ai/reference/client-js/memory | [Mastra Client](https://mastra.ai/docs/server/mastra-client) |

**Processors (memory-related):**

| Processor | URL |
| --- | --- |
| Working memory processor | https://mastra.ai/reference/processors/working-memory-processor |
| Semantic recall processor | https://mastra.ai/reference/processors/semantic-recall-processor |
| Message history processor | https://mastra.ai/reference/processors/message-history-processor |

**Storage (persistence layer):** https://mastra.ai/reference/storage/ · doc: [storage](https://mastra.ai/docs/memory/storage)

---

## MCP fetch examples

```json
{
  "paths": [
    "docs/memory/working-memory",
    "docs/memory/observational-memory",
    "reference/memory/memory-class",
    "reference/memory/observational-memory"
  ]
}
```

Package: `@mastra/memory` — use `readMastraDocs` with `projectPath` set to the absolute path of the current checkout root.

---

## Verification recipe: identity, refresh and concurrent updates

Use an explicitly authorized QA environment and real existing persistence/route ownership code. **This is a test plan, not completed certification.** Locate the current `src/app/api/copilotkit/[[...path]]/route.ts`, `src/lib/copilotkit-thread-ownership.ts`, and `src/mastra/lib/agent-memory.ts` before choosing test seams.

1. **Server-derived identity:** for signed-in QA user A, create thread A; capture its server-resolved `threadId` and `resourceId`. A's follow-up must reuse both. The client must not be able to assign another user's `resourceId`.
2. **Cross-user denial:** signed-in QA user B attempts to read, reuse, mutate, or resume A's thread through all exposed paths. Expect an authorization failure and **zero** access to A's transcript, selected listing, budget, or working memory; test guests separately.
3. **Refresh and replay:** A sets a price cap, selected listing, and map pin; reloads; continues the same conversation. Confirm the stored state, retrieval, and UI agree. Verify deliberate `mapUi.selectedPinId: null` actually clears a previously selected pin.
4. **Concurrency across processes:** run two authorized updates to different fields of A's **same thread** concurrently from **two independent server processes/instances**. Read back persisted memory and require both fields to survive. Repeat with selected-pin clearing and conflicting same-field writes; define the expected conflict rule before judging the result.
5. **Failure/retry:** induce a failed update, retry safely, check no other user's state was changed and that storage errors do not appear as successful memory updates. Confirm server-side writes, not only returned agent prose.

**Known limitation requiring work under SAN-1626:** `src/mastra/lib/agent-memory.ts` serializes updates only inside one process (`withThreadLock`). Its read-modify-write path can still lose updates across instances (last-write-wins); do not claim this case passes until independently proven. Check version-supported atomic merge/CAS or existing Postgres locking **in the canonical memory owner**—never introduce a second memory service or a pretend mutex. Keep RLS and resource/thread isolation.

## mdeai pointers

| Artifact | Path |
| --- | --- |
| Concierge working memory schema | `src/mastra/agents/concierge.ts` + `src/lib/types.ts` |
| Concierge patterns | [`mdeai-concierge.md`](mdeai-concierge.md) |
| v1 memory migration | https://mastra.ai/guides/migrations/upgrade-to-v1/memory |
