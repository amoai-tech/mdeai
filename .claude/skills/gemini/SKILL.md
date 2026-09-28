---
name: gemini
description: >-
  Use for MDE work involving Gemini models, @ai-sdk/google, Gemini tools or grounding, structured output, multimodal input/output, embeddings, research, streaming, or Gemini-specific failures. Also use when deciding whether Google Search, URL Context, Maps Grounding, Gemini background interactions, or managed agents belong in an MDE workflow.
metadata:
  mde-version: "1.1.0"
  upstream-commit: "6fee1bec62d6a0ca92c1d0e34d62ff11f70c498a"
  mde-provider-baseline: "@ai-sdk/google 2.0.74"
---

# Gemini — official upstream + MDE overlay

## Source order

1. Inspect the current MDE provider package, model strings, and call sites.
2. Read the matching MDE reference below for routing and architecture decisions.
3. Read the matching official vendored Gemini skill/reference for current API/model guidance.
4. Fetch the current official Gemini documentation page required by that skill before changing version-sensitive code.
5. Make the smallest provider-compatible change and verify behavior.

Do not trust remembered Gemini model names, SDK signatures, quotas, or deprecation status. Do not migrate MDE from `@ai-sdk/google` to `@google/genai` unless that architecture change is explicitly in scope.

## Ownership

Gemini owns model/provider selection, Gemini-native information tools, Gemini-specific function/tool contracts, structured output, multimodal behavior, embeddings, and Gemini-specific failures.

- `mastra` owns agent/workflow orchestration.
- `maps` owns Google Maps JS, Places UI, routes, markers, and map rendering.
- MDE domain tools own booking, rentals, events, restaurants, and other business rules.
- Authenticated backend/Supabase paths own persisted mutations.

## MDE capability routing

- Fresh web/current facts → read `references/mde-grounding-and-tools.md`.
- Known public URL or Search + URL inspection → read `references/mde-grounding-and-tools.md`.
- Place/location reasoning → read `references/mde-grounding-and-tools.md`, then use `maps` for rendering/Places/routes concerns.
- Cost, latency, model class, tool budgets, or stop conditions → read `references/mde-optimization.md`.
- Long-running Gemini background interactions or webhooks → read `references/mde-background-jobs.md`.
- Managed agent environments, credentials, or hooks → read `references/mde-managed-agents.md`.
- Runtime/API details → read the matching official vendored Gemini reference.

## Current MDE invariants

- Preserve the current `@ai-sdk/google` boundary unless migration is explicitly requested.
- Verify exact model identifiers and provider support before changing model strings.
- Keep structured-output schemas, tool contracts, fallbacks, and failure states explicit and tested.
- Preserve grounding metadata, citations, and place attribution where required.
- Prefer Gemini-native tools for information acquisition; use MDE/Mastra tools for authenticated business actions.
- Send database mutations only through authenticated backend/Supabase paths.
- Treat model or tool changes as behavior changes: rerun representative prompts and runtime tool/schema tests, not only typecheck.
- Do not enable Live API, Omni, managed agents, or background-webhook architecture merely because official references exist.

## Verification

For model/provider changes, prove the model exists and the installed integration supports it. For structured output/tools, validate actual runtime output and failure behavior. For grounding, verify source metadata/attribution. For cross-system S3/S4 changes, finish with independent `code-review` and `task-verifier`.

## References

### MDE decisions

- `references/mde-grounding-and-tools.md` — Search, URL Context, Maps Grounding, tool combination, action boundaries.
- `references/mde-optimization.md` — cost/latency/tool budgets, stop conditions, model-class guidance.
- `references/mde-background-jobs.md` — background interactions and webhook adoption criteria.
- `references/mde-managed-agents.md` — environment, credentials, hooks, and architecture-review criteria.

### Official vendored Gemini

- `upstream.yaml`
- `references/official/gemini-api-dev/SKILL.md`
- `references/official/gemini-api-dev/references/migration.md`
- `references/official/gemini-live-api-dev/SKILL.md` — only for Live API work.
- `references/official/gemini-omni-flash-api/SKILL.md` — only for Omni Flash work.
- https://ai.google.dev/gemini-api/docs
- https://github.com/google-gemini/gemini-skills
