---
name: using-mde-skills
description: Route ambiguous, non-trivial MDE engineering requests to exactly one canonical execution owner while preserving S4 independent verification. Use only when ownership is genuinely ambiguous; do not use for simple S0 explanation, reading, or factual questions that can be answered directly.
---

# Using MDE Skills

Use this skill only when ownership is ambiguous and the request is non-trivial. Simple S0 explanation, reading, or factual questions should be answered directly without invoking this router. If one canonical domain or workflow skill is clearly responsible, invoke that skill directly and bypass this router; S4 safety still applies, and the canonical execution owner must hand S4 work to `task-verifier` for independent verification before completion.

## Routing contract

The router chooses one owner and stops. **Specific requested outcome beats a broad domain or lifecycle label**; use the short skill for its scoped job, and read a deep/domain skill only for necessary rules.

- create/rewrite one Linear issue → `linear-task`; read-only task audit → `linear-audit`
- PR merge-readiness audit → `praudit`; existing PR/diff code review → `code-review`
- bug/root-cause diagnosis, unknown failure → `errors`; deep methodology → `systematic-debugging`
- design regression coverage → `tests`; test strategy/TDD/execution → `testing`; browser E2E → `e2e`
- request a faster reuse-first option → `efficient`; detailed reuse/source discipline → `ponytail`
- design a plan without modifying code → `plan`; architectural fit → `architect`
- implement scoped work → `implement`
- ambiguous substantial implementation, worktree/PR lifecycle and shipping → `tasks`
- post-merge outcome verification → `merge`; merged worktree cleanup → `tasks`
- independently prove Done/merge/production safety → `task-verifier`; deployed release certification → `prod`
- research/evidence → `research`; domain-specific factual work → matching canonical domain owner
- explicit short-skill invocation → requested short skill within its permitted scope

Use `tasks`, `systematic-debugging`, `testing`, `code-review`, and specialist skills for deeper guidance, not as automatic substitutes for a matching short workflow. Keep independent S4 verification and the repo's domain security rules. Do not duplicate any workflow implementation in this router.

## S4 safety

Treat payments/financial side effects, auth/RLS/tenant-boundary changes, secrets/security controls, destructive or irreversible production-data changes, and duplicate/retry-sensitive or irreversible external side effects as S4.

S4 work requires independent verification. The execution owner cannot self-certify completion. If independent verification fails, return the work to the execution owner for correction and re-verification.

## Retired behavior

Do not restore the old eight-field routing schema, large deterministic support matrix, adaptive routing memory, or router-owned execution policy from PR #45.
