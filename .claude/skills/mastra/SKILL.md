---
name: mastra
description: >-
  Use for any MDE request clearly involving Mastra, including agents, tools, workflows, memory, storage, RequestContext, streaming, suspend/resume, HITL, evals, traces, runtime bridges, and Mastra-specific bugs/errors/failures. A known Mastra failure stays with this domain owner rather than generic systematic-debugging.
metadata:
  mde-version: "2.0.0"
  upstream-commit: "08428f9b47cdae1131d12cbd9f8e0886ff476211"
  verified-package: "@mastra/core 1.35.0"
  verified-at: "2026-09-28"
---

# Mastra — official upstream + MDE overlay

## Package maturity — read before trusting a signature

MDE runs a **mixed** Mastra surface: a stable core beside prerelease satellites.
An API you find in the docs may sit in a package line that is still alpha here, so
check the installed type definition rather than assuming coherence.

| Package | Installed | Line |
|---|---|---|
| `@mastra/core` | 1.35.0 | stable |
| `@mastra/pg` | 1.11.0 | stable |
| `@mastra/client-js` | 1.19.1 | stable |
| `@mastra/memory` | 1.0.1-alpha.1 | **alpha** |
| `@mastra/libsql` | 1.1.0-alpha.2 | **alpha** |
| `mastra` | 1.1.0-alpha.3 | **alpha** |
| `@ag-ui/mastra` | 0.2.1-beta.2 | **beta** |

Known consequence: `@mastra/memory`'s `Memory.recall()` return shape does not match
what `@mastra/core` expects, which the repo suppresses in `src/mastra/agents/index.ts`.
Expect this class of drift and verify against the installed `.d.ts` before relying on
a documented shape.

## Source order

1. Inspect installed `@mastra/*` versions and current MDE source.
2. Read `references/official/mastra/SKILL.md`.
3. Use the official embedded-docs procedure against installed packages.
4. If embedded docs are insufficient, inspect installed source/type definitions.
5. Use current remote Mastra docs only after version-matched local sources.
6. Apply the MDE-specific invariants and references below.

Never rely on remembered Mastra APIs when current installed docs/source can prove the contract.

## Ownership

Own Mastra agent definitions, tools, workflows, memory, storage, streaming, RequestContext, suspend/resume, HITL semantics, trace/eval behavior, and Mastra-side CopilotKit integration. `copilotkit` owns browser-facing provider/hooks/AG-UI rendering. Domain skills own business invariants.
## Current MDE invariants

- Preserve tenant/user/request context from the CopilotKit runtime through Mastra execution.
- Keep tool-map keys stable where CopilotKit render/action registration depends on them.
- Treat persistence, resume, HITL, authz, and duplicate side effects as S3/S4 contracts that need explicit negative/replay proof.
- Prefer durable storage for resumable workflows; never assume ephemeral process state is sufficient.
- Verify model/provider identifiers with the official provider-registry helper when model selection changes.
- Keep MDE agent allowlists and telemetry intact when changing runtime registration.

## Workflow

1. Classify the change: agent, tool, workflow, memory/storage, streaming, HITL/resume, model, or trace/eval.
2. Follow the matching official Mastra reference under `references/official/mastra/`.
3. Load only the MDE reference needed for the affected project contract.
4. For bugs, reproduce and trace the failure before editing.
5. Make the smallest version-compatible change.
6. Verify targeted behavior plus persistence/retry/cancellation/replay paths when relevant.

## MDE references

Use existing project references only for MDE-specific behavior, including `references/mdeai-concierge.md`, `references/copilotkit.md`, `references/memory.md`, `references/workflows.md`, `references/tools.md`, `references/streaming.md`, and `references/supabase-auth.md`. Treat older broad examples as historical unless current code confirms them.

## Verification

Run typecheck/tests for the affected surface and exercise the real agent/workflow path when behavior crosses process or persistence boundaries. S3/S4 changes require independent `code-review` and `task-verifier` before Done.

## References

- `upstream.yaml` — pinned provenance, reviewed commit, and integrity hashes
- `references/human-in-the-loop.md` — approval, suspend/resume, durable runs
- `references/official/mastra/SKILL.md` — vendored vendor skill, read-only

MDE overlays — read the one matching the affected contract:

| Area | Reference |
|---|---|
| Concierge agent | `references/mdeai-concierge.md` |
| CopilotKit bridge | `references/copilotkit.md`, `references/headless-ui.md`, `references/display-only.md` |
| Memory | `references/memory.md`, `references/supabase-auth.md` |
| Workflows | `references/workflows.md`, `references/workspace.md`, `references/workspace-skills.md` |
| Tools and approval | `references/tools.md`, `references/human-in-the-loop.md` |
| Streaming | `references/streaming.md` |
| Multi-agent | `references/multi-agent.md`, `references/agents-supervisor.md` |
| RAG | `references/rag-mastra.md`, `references/rag-pgvector.md` |
| Models | `references/model-providers.md`, `references/gemini.md`, `references/openai.md`, `references/ai-sdk.md` |
| MCP | `references/mcp.md`, `references/mcp-apps.md`, `references/mcp-docs-lookup.md` |
| Skills and routing | `references/topic-routing.md`, `references/embedded-docs.md`, `references/remote-docs.md` |
| First setup and migration | `references/create-mastra.md`, `references/migration-guide.md` |
| Errors | `references/common-errors.md` |
| UI surface | `references/browser.md`, `references/react.md`, `references/slots.md` |

- https://mastra.ai/docs
- https://github.com/mastra-ai/mastra
