---
name: using-mde-skills
description: Route ambiguous, non-trivial MDE engineering requests to exactly one canonical execution owner while preserving S4 independent verification. Use only when ownership is genuinely ambiguous; do not use for simple S0 explanation, reading, or factual questions that can be answered directly.
---

# Using MDE Skills

Use this skill only when ownership is ambiguous and the request is non-trivial. Simple S0 explanation, reading, or factual questions should be answered directly without invoking this router. If one canonical domain or workflow skill is clearly responsible, invoke that skill directly and bypass this router; S4 safety still applies, and the canonical execution owner must hand S4 work to `task-verifier` for independent verification before completion.

## Routing contract

The router chooses one owner and stops.

- ambiguous substantial implementation → `tasks`
- unknown failure → `systematic-debugging`
- research/evidence → `research`
- existing PR/diff → `code-review`
- Done/merge/production proof → `task-verifier`
- obvious domain/vendor request → invoke the matching canonical skill directly

Do not plan implementation steps, choose support arrays, manage parallelization, manage Linear handoff, or duplicate domain/vendor instructions here.

## S4 safety

Treat payments/financial side effects, auth/RLS/tenant-boundary changes, secrets/security controls, destructive or irreversible production-data changes, and duplicate/retry-sensitive or irreversible external side effects as S4.

S4 work requires independent verification. The execution owner cannot self-certify completion. If independent verification fails, return the work to the execution owner for correction and re-verification.

## Retired behavior

Do not restore the old eight-field routing schema, large deterministic support matrix, adaptive routing memory, or router-owned execution policy from PR #45.
