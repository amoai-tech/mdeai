---
name: mastra
description: >-
  Use when MDE work changes or diagnoses Mastra agents, tools, workflows, memory, storage, RequestContext, streaming, suspend/resume, HITL, evals, traces, or the CopilotKit-to-Mastra runtime bridge.
metadata:
  mde-version: "2.0.0"
  upstream-commit: "08428f9b47cdae1131d12cbd9f8e0886ff476211"
  installed-baseline: "@mastra/core beta / @mastra/memory beta / @mastra/pg ^1.1.0-alpha.2"
---

# Mastra — official upstream + MDE overlay

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

- `upstream.yaml`
- `references/official/mastra/SKILL.md`
- `references/official/mastra/references/embedded-docs.md`
- `references/official/mastra/references/common-errors.md`
- `references/official/mastra/references/core-concepts.md`
- `references/official/mastra/references/mastra-api.md`
- `references/official/mastra/references/model-selection.md`
- https://mastra.ai/docs
- https://github.com/mastra-ai/mastra
