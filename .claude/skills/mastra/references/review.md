# Mastra review invariants

## Source of truth

1. Changed MDE code/tests and installed `@mastra/*` source/types.
2. Canonical `mastra/SKILL.md`.
3. Installed embedded docs where present.
4. Current official Mastra docs/source for concepts or migrations.

## Review invariants

- Preserve server-verified user/tenant/request context through agent, tool, and workflow execution.
- RequestContext carries request metadata; it is not authorization by itself.
- Browser IDs, memory contents, and model output never establish authority.
- Consequential tools require server/domain authorization and replay-safe side effects.
- Memory/thread/resource scope must prevent cross-user or cross-tenant bleed.
- HITL approval must bind to the exact validated artifact/revision/hash.
- Resume/callback paths must reject stale, duplicate, foreign, or malformed authority.
- Required durable workflows must not silently fall back to ephemeral state.
- Stop/abort must prevent later protected side effects where cancellation is promised.
- Package-family/API claims must be proven against installed source/types or current official migration guidance.
- Trace/eval/observability changes must preserve trace correlation across agent, tool, and workflow boundaries.
- Trace/eval/observability changes must not log credentials, secrets, tokens, or sensitive request context.
- Failed and retried executions must remain distinguishable in traces/evals so retries cannot hide the original failure or look like a single clean run.

For authority defects, include the smallest tenant A → tenant B failure, the safe boundary, and deterministic denial/replay proof.
