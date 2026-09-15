---
name: lean-dev-flow
description: >-
  Use when an active MDE implementation needs the fastest safe local feedback loop or a risk-matched test tier.
title: lean-dev-flow — mdeapp lean implementation loop
impact: HIGH
impactDescription: Cuts per-task cycle overhead by eliminating floor-on-every-change, wrong test tier, stale worktrees, and silent verify-script failures
tags: lean, testing, vitest, verification, implementation, efficiency
paths:
  - "mdeapp/src/**"
  - "mdeapp/e2e/**"
  - "mdeapp/scripts/**"
  - "mdeapp/workspace/**"
---

# Lean Development Flow

Use this skill only after the primary workflow (`tasks`, `systematic-debugging`, or `tdd`) has established what is being changed. Its job is to shorten feedback without weakening proof.

## Decision rule

- Tiny/local change: run the narrowest directly affected test or static check first.
- Domain change: run affected domain tests plus type/lint checks that can catch interface breakage.
- Cross-system, auth, payment, migration, or release-sensitive change: escalate to the broader gates defined by `testing` and `task-verifier`.
- Do not run the full floor after every edit when a cheaper deterministic probe can disprove the change faster.

## Boundaries

`tasks` owns the Linear execution lifecycle. `tdd` owns RED → GREEN → REFACTOR. `testing` owns test selection and execution details. `mde-worktree-pr-flow` owns Git/PR hygiene. `task-verifier` owns final independent certification.

## Fast loop

1. Inspect the exact changed boundary.
2. Run the cheapest relevant failing/passing probe.
3. Make one bounded change.
4. Re-run that probe.
5. Expand to domain tests if the boundary changed.
6. Hand off to `testing` before commit/merge according to task risk.

Never trade correctness, security, tenant isolation, idempotency, or approval integrity for speed.
