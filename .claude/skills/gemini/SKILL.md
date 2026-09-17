---
name: gemini
description: >-
  Use for any MDE request clearly involving Gemini, including models, Google AI SDK/provider usage, function calling, structured output, multimodal I/O, grounding, embeddings, research agents, streaming, and Gemini-specific bugs/errors/failures. A known Gemini failure stays with this domain owner rather than generic systematic-debugging; do not use for generic Mastra orchestration or unrelated Google Maps behavior.
metadata:
  mde-version: "1.0.0"
  upstream-commit: "80dd31dda25bbe1410207df0adb3e0d591c2c634"
  mde-provider-baseline: "@ai-sdk/google 2.0.74"
---

# Gemini — official upstream + MDE overlay

## Source order

1. Inspect the current MDE provider package, model strings, and call sites.
2. Read `references/official/gemini-api-dev/SKILL.md` for current Gemini API/model guidance.
3. Fetch the current official Gemini documentation page required by that skill before changing version-sensitive code.
4. Use the Live API or Omni Flash official skills only when the task actually uses those runtimes.
5. Apply the MDE-specific integration rules below.

Do not trust remembered Gemini model names, SDK signatures, quotas, or deprecation status. Do not migrate MDE from `@ai-sdk/google` to `@google/genai` unless the task explicitly requires that architectural change.

## Ownership

Own Gemini model/provider selection, Gemini-specific tool/function contracts, structured output, multimodal/grounding/embedding behavior, and Gemini-specific errors. `mastra` owns agent/workflow orchestration. `maps` owns map/place behavior. Domain skills own business meaning.
## Current MDE invariants

- Current MDE integration uses `@ai-sdk/google` 2.0.74; preserve that provider boundary unless migration is explicitly in scope.
- Verify the exact model identifier and provider support before changing model strings.
- Keep structured-output schemas, tool contracts, and fallback behavior explicit and tested.
- Grounding/search or Maps behavior must preserve citations/attribution requirements where applicable.
- Treat model changes as behavior changes: rerun representative prompts and structured-output/tool tests, not only typecheck.
- Do not enable Live API or Omni-specific paths merely because the official references exist.

## Workflow

1. Classify: model/provider, structured output, function/tool calling, multimodal, grounding/search, embeddings, research agent, streaming, Live API, or Omni.
2. Read the matching official Gemini skill/reference first.
3. Verify the installed MDE provider and current call-site contract.
4. Check current official docs/model availability before editing.
5. Make the smallest provider-compatible change.
6. Verify representative success, schema/tool correctness, and failure/fallback behavior.

## Verification

For model/provider changes, prove the requested model exists and the installed integration supports it. For structured output/tools, validate schema and actual runtime output. For grounding/search, verify source metadata/attribution. For S3/S4 cross-system changes, finish with independent `code-review` and `task-verifier`.

## References

- `upstream.yaml`
- `references/official/gemini-api-dev/SKILL.md`
- `references/official/gemini-api-dev/references/migration.md`
- `references/official/gemini-live-api-dev/SKILL.md` — only for Live API work
- `references/official/gemini-omni-flash-api/SKILL.md` — only for Omni Flash work
- https://ai.google.dev/gemini-api/docs
- https://github.com/google-gemini/gemini-skills
