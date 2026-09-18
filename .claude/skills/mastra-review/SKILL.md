---
name: mastra-review
description: Review MDE Mastra agents, tools, workflows, RequestContext, memory, persistence, HITL, streaming and package changes for material correctness and tenant-safety regressions.
metadata:
  owner: SAN-1312
  version: "1.0.0-mde.1"
---

# Mastra PR Review

## Source of truth

1. Changed MDE code/tests and installed @mastra/* source/types.
2. Canonical MDE .claude/skills/mastra/SKILL.md.
3. Installed embedded docs where present.
4. Current official Mastra docs/source for concepts or migrations.

MDE uses beta Mastra packages. Never infer current API behavior from stale examples.

## Review invariants

- Preserve server-verified user/tenant/request context through agent, tool and workflow execution.
- RequestContext carries request metadata; it is not authorization by itself.
- Browser IDs, memory contents and model output never establish authority.
- Consequential tools require server/domain authorization and replay-safe side effects.
- Memory/thread/resource scope must prevent cross-user or cross-tenant bleed.
- HITL approval must bind to the exact validated artifact/revision/hash.
- Resume/callback paths must reject stale, duplicate, foreign or malformed authority.
- Required durable workflows must not silently fall back to ephemeral state.
- Stop/abort must prevent later protected side effects where cancellation is promised.
- Package-family/API claims must be proven against installed source/types or current official migration guidance.

For authority defects include the smallest tenant A -> tenant B failure, the safe boundary to enforce, and deterministic denial/replay proof.
