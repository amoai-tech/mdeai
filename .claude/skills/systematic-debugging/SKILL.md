---
name: systematic-debugging
description: >-
  Use when a bug, failed test, regression, flaky behavior, integration failure, or unexpected runtime result needs root-cause diagnosis.
---

# Systematic Debugging

## Purpose

Find the root cause before changing behavior. Treat symptoms, reviewer guesses, and error messages as evidence to test, not fixes to apply blindly.

## MDE ownership

Use this skill to diagnose. Use `tdd` to lock the failure into a regression test, the affected domain skill for implementation-specific rules, `code-review` to review the patch, and `task-verifier` to prove the task or PR is complete.

## Workflow

1. **Reproduce** the failure with the smallest reliable command, request, or user journey.
2. **Capture evidence**: exact error, inputs, environment, branch/commit, affected boundary, and whether the failure is deterministic.
3. **Trace backward** from the bad value or failed boundary until the first incorrect assumption/state transition is found.
4. **Form one hypothesis** that explains the evidence.
5. **Run the smallest experiment** that can falsify that hypothesis. Change one variable at a time.
6. **Write or update a regression test** when the behavior is testable.
7. **Apply the smallest root-cause fix**. Do not bundle unrelated cleanup.
8. **Re-run the reproduction + targeted tests + affected journey**.
9. **Escalate the proof** only if the risk warrants it: typecheck/lint/build, integration/E2E, live service, or production smoke.

## Boundary debugging

For MDE integrations, record the value at each boundary instead of guessing which layer failed:

`UI → Next.js route/server action → CopilotKit/AG-UI → Mastra → domain tool → Supabase/Stripe/Maps/Cloudinary → response/UI`

At each boundary verify: input shape, auth/tenant context, IDs, timeout/cancellation, side effects, output shape, and error propagation.

## Stop conditions

Stop proposing fixes when you cannot reproduce or localize the failure. Gather more evidence instead. Stop if the proposed patch only suppresses an error, retries indefinitely, weakens authorization, bypasses validation/HITL, or changes unrelated behavior.

## Common traps

- "This looks like X" without proving X.
- Changing multiple variables before rerunning.
- Treating a green unit test as proof of routing/integration behavior.
- Fixing the caller when the source data is already wrong.
- Adding fallback behavior that hides a broken authoritative path.
- Rerunning flaky tests until green without explaining the flake.

## References

Read only when needed:
- [`references/root-cause-tracing.md`](references/root-cause-tracing.md) — trace bad values backward.
- [`references/condition-based-waiting.md`](references/condition-based-waiting.md) — timing/race failures.
- [`references/defense-in-depth.md`](references/defense-in-depth.md) — validation across trust boundaries.
- [`scripts/find-polluter.sh`](scripts/find-polluter.sh) — deterministic test-pollution helper.
