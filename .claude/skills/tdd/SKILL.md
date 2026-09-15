---
name: tdd
description: >-
  Use when implementing a feature or bugfix whose behavior can be expressed as an automated test, especially regressions, domain rules, API contracts, RLS, workflows, and user journeys.
---

# Test-Driven Development

## Purpose

Use RED → GREEN → REFACTOR to prove the test detects missing behavior before implementation and to keep tests focused on stable behavior rather than internals.

## The loop

1. **Choose one behavior.** Define the observable result and the public seam where it can be tested.
2. **RED:** write the smallest test that expresses that behavior. Run it and confirm it fails for the intended reason.
3. **GREEN:** write the smallest production change that makes the test pass.
4. **REFACTOR:** improve names/structure without changing behavior; keep tests green.
5. Repeat for the next behavior.

If the test passes before the implementation change, the test is not proving the new behavior. Fix the test or choose a better seam before coding.

## MDE seam selection

Prefer the cheapest test that proves the requirement:
- pure domain behavior → Vitest unit test;
- module/API contract → integration test through exported interface;
- Supabase authorization/data rule → SQL/RLS allow + deny tests against the intended role/tenant;
- Mastra tool/workflow → tool/workflow test plus routing/resume/negative proof when relevant;
- Next.js/CopilotKit user behavior → component/integration test or Playwright journey;
- Stripe/webhook/write path → idempotency/replay tests and provider-safe integration proof;
- production-only contract → targeted smoke after lower levels are green.

Do not mock the behavior under test. Mock only external boundaries whose real implementation is irrelevant to the behavior being proven.

## Required regression pattern

For a bug:

`reproduce → failing regression test → fix → regression test passes → adjacent tests → user/integration journey if material`

## Stop conditions

Stop if the proposed test only asserts implementation details, snapshots unstable markup, requires broad unrelated setup, or cannot fail for the bug/feature being implemented. Redesign the seam first.

## References

- [`references/tests.md`](references/tests.md) — examples of durable behavior tests.
- [`references/mocking.md`](references/mocking.md) — mocking boundaries and anti-patterns.
- [`references/writing-good-tests.md`](references/writing-good-tests.md) — broader test-quality guidance.
