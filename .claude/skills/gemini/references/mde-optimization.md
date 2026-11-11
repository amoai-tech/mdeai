# MDE Gemini optimization

Use this reference when an MDE Gemini change affects cost, latency, tool-call volume, model selection, timeout behavior, or production reliability.

## Core rules

1. Use the smallest model class that reliably satisfies the task.
2. Do not invoke Search, URL Context, or Maps Grounding when existing trusted context is sufficient.
3. Limit external calls and URLs to what the request actually needs.
4. Reuse already-retrieved evidence within the same workflow instead of fetching it again.
5. Set explicit timeout, retry, and stop conditions for tool-using flows.
6. Prevent open-ended agent/tool loops with bounded iterations or workflow-level termination conditions.
7. Measure latency, token usage, failures, and grounding/tool-call counts for production paths.
8. Preserve a graceful fallback when a grounding provider or external source is unavailable.
9. Treat model/tool changes as behavior changes and rerun representative evals.

## MDE model-class guidance

Do not hard-code future model identifiers here. Use the current vendored Google reference for exact names.

```text
Common concierge / grounded answer
→ Flash-class model

High-volume classification / extraction
→ Flash-Lite-class model when quality is sufficient

Hard research / complex reasoning
→ stronger model only when task evidence justifies it
```

## Tool budget guidance

For Search + URL Context + Maps + custom tools:

- start with the minimum tool set required for the request;
- avoid fetching multiple pages that repeat the same evidence;
- prefer an authoritative primary source over several lower-quality duplicates;
- do not use Maps grounding for non-location questions;
- do not use URL Context for a page whose relevant content is already available in trusted context;
- stop once evidence is sufficient for the requested answer or action.

## Production verification

Before shipping a changed Gemini path, record where practical:

- end-to-end latency;
- model used;
- external tool calls;
- retrieved URL count;
- token usage/cost signal;
- fallback result when the external tool fails;
- whether citations/grounding metadata remain intact.

Official reference: https://ai.google.dev/gemini-api/docs/optimization
