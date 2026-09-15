---
name: using-mde-skills
description: >-
  Use when an MDE request could involve multiple skills or the correct workflow, domain, review, or verification owner is unclear.
---

# Using MDE Skills — router only

This skill **routes; it does not implement, debug, review, test, or ship**. Make one routing decision, hand off, then get out of the way.

## Router contract

1. Classify the request as **S0–S4** using `routing.yaml`.
2. Select one primary owner from the registered hierarchy.
3. Add only specialists required by the affected stack or unresolved ambiguity.
4. Return the handoff order and any safe parallel branches.
5. Do not execute the child workflow from this skill.

## Primary owners

| Intent | Primary owner |
|---|---|
| Substantial SAN feature/change | `tasks` |
| Bug, regression, flaky failure | `systematic-debugging` |
| Skill authoring/maintenance | `writing-skills` |
| Existing diff/PR review | `code-review` |
| Done/merge/production certification | `task-verifier` |
| Pure evidence gathering | `research` |
| Narrow domain-only request | owning domain specialist |

## Complexity gate

- **S0 — trivial:** direct edit/query; no orchestration.
- **S1 — focused:** one primary skill; specialists only if required.
- **S2 — multi-part:** primary orchestrator + a small specialist set.
- **S3 — system change:** dependency-aware cross-system work with explicit checkpoints and review, when no S4 risk trigger is present.
- **S4 — production critical:** any payment, auth/RLS/tenant-boundary, security/secret, destructive production-data, irreversible publish, or duplicate external-side-effect risk. S4 takes precedence over breadth and requires adversarial verification, failure/recovery proof, and strict stop conditions.

Never inflate S0/S1 work into a full lifecycle merely because skills exist.

## Handoff rules

- `tasks` is the formal build orchestrator.
- `systematic-debugging` owns diagnosis until root cause is established.
- `code-review` and `task-verifier` remain independent critics (`context: fork`).
- `mde-worktree-pr-flow` owns Git mechanics only after the implementation/review path is known.
- Domain skills explain **how** to work in their system; they do not replace the workflow owner.
- `mermaid-diagrams`, `wireframe`, `domain-modeling`, `codebase-design`, and `research` are conditional reasoning aids, not mandatory ceremony.

## Parallelization rule

Parallelize only steps with no data/control dependency between them. Discovery is often parallel-safe; migrations → generated contracts → dependent implementation are not. When uncertain, serialize.

## Failure policy

Use the policy in `routing.yaml`: transient failures may retry; optional evidence may skip with an explicit limitation; test/security/schema/production-contract failures stop and reroute; destructive uncertainty requires user approval.

## Global guardrails

Think before coding. Prefer the simplest viable solution. Make the smallest safe change. Define observable success before implementation. Current code/runtime evidence outranks stale plans.

Read `routing.yaml` for the machine-readable registry and `references/routing-map.md` for human-readable boundaries.
