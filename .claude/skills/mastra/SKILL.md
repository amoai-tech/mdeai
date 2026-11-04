---
name: mastra
description: >-
  Use for any MDE request clearly involving Mastra, including agents, tools, workflows, memory, storage, RequestContext, streaming, suspend/resume, HITL, evals, traces, runtime bridges, and Mastra-specific bugs/errors/failures. A known Mastra failure stays with this domain owner rather than generic systematic-debugging.
metadata:
  mde-version: "2.1.0"
  upstream-commit: "1b3d178260a3ff88a075bc44075439d8d227e990"
  verified-package: "@mastra/core 1.74.0"
  verified-at: "2026-10-05"
---

# Mastra — official upstream + MDE overlay

## Package maturity — read before trusting a signature

MDE runs one **coherent stable** Mastra family (SAN-1338). The previous mixed
alpha/beta surface and the `Memory.recall()` type-drift suppression are gone; verify
against the installed type definition rather than assuming a signature.

The versions below are a **PR #717 snapshot**, not a promise about every worktree or a
future SAN-1626 upgrade. Before any API recommendation, compare this table with the
current `package.json`, `package-lock.json`, and the actual installed package
`package.json`/exports (when `node_modules` exists). Update this snapshot in the
same PR as a family upgrade; do not install `@latest` to make the table true.

| Package | Snapshot | Release line |
|---|---|---|
| `@mastra/core` | 1.74.0 | stable |
| `@mastra/pg` | 1.29.0 | stable |
| `@mastra/client-js` | 1.51.2 | stable |
| `@mastra/memory` | 1.35.0 | stable |
| `@mastra/libsql` | 1.25.0 | stable |
| `mastra` | 1.32.1 | stable |
| `@ag-ui/mastra` | 1.1.6 | stable |

`@ag-ui/mastra` is a real boundary: `LoggingMastraAgent` extends its `MastraAgent`, so
re-verify `resourceId`, newest-turn trimming, streaming, and telemetry when it changes.

MDE keeps one small working-memory shim in `src/mastra/lib/agent-memory.ts`: the native
tool strips null optionals before its merge, which would silently drop MDE's deliberate
`mapUi.selectedPinId: null` = "no pin selected". The shim keeps the blank-placeholder
input schema and clears the pin through the public Memory API.

## Source order

1. Inspect installed `@mastra/*` versions and current MDE source.
2. Read `references/official/mastra/SKILL.md`.
3. Use the official embedded-docs procedure against installed packages.
4. If embedded docs are insufficient, inspect installed source/type definitions.
5. Use current remote Mastra docs only after version-matched local sources.
6. Apply the MDE-specific invariants and references below.

Never rely on remembered Mastra APIs when current installed docs/source can prove the contract.

**MDE override for newer official references:** Vendor documentation may describe Mastra Platform deployment or automatic external bug/feedback submission. MDE deploys through its existing Vercel process. Do not switch hosting or transmit MDE code, diagnostics, logs, or bug reports to upstream services unless the owner explicitly authorizes that action. Follow installed-version types before adopting APIs from upstream `main`.

## Safe Mastra CLI diagnostics

- **Select the target explicitly:** before any `mastra api` inspection, check the installed CLI help and pass `--url` for the intended, authorized server. Some trace/observability commands otherwise default to Mastra's hosted observability endpoint, even when local Studio is running. Never assume a command points at MDE's local runtime.
- **Read-only first:** for example, `mastra api --url http://localhost:4111 agent list` or `mastra api --url http://localhost:4111 trace query --help` after verifying the installed CLI supports the command. Running an agent, executing a tool, uploading traces, or changing a remote environment is not a harmless diagnostic; confirm authorization and impact first.
- **Review CLI telemetry:** set `MASTRA_TELEMETRY_DISABLED=1` for a diagnostic command when opting out of Mastra usage analytics. This is a per-process CLI choice, **not** an instruction to change MDE's application environment, tracing pipeline, or observability configuration. It does not prevent model calls or other configured network traffic.
- **Version first:** prefer installed package docs under `node_modules/@mastra/*/dist/docs/`, their `assets/SOURCE_MAP.json`, and installed types. The official CLI guide can describe commands newer than MDE's installed CLI; never install `mastra@latest` simply to run diagnostics.

References: https://mastra.ai/reference/observability/tracing/advanced-queries and https://mastra.ai/blog/upgraded-mastra-cli.

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

Use MDE-specific references such as `references/mdeai-concierge.md`, `references/memory.md`, `references/workflows.md`, `references/tools.md`, and `references/streaming.md` against current code. `references/copilotkit.md` documents a **separate-server example**, and `references/supabase-auth.md` documents **standalone Mastra HTTP auth**; neither is the default MDE runtime or an instruction to scaffold, install dependencies, or replace the current same-origin Next.js bridge. Do not treat historical broad examples as implementation authority.

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
| CopilotKit bridge | Current `src/app/api/copilotkit/[[...path]]/route.ts`, CopilotKit skill `references/mastra-bridge.md`; `references/copilotkit.md` is standalone-only |
| Memory | `references/memory.md`; `references/supabase-auth.md` is standalone Mastra HTTP auth only |
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
