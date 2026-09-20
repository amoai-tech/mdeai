# Lean execution loop

Use this for implementation inside `tasks`. It replaces the retired `lean-dev-flow` skill.

## Principle

Run the cheapest reliable proof that answers the current claim, then broaden only when risk or failure evidence requires it. Do not rerun the full repository gate after every small edit.

## Inner loop

1. Inspect the exact current files/callers/tests that own the change.
2. Make one coherent file/group change.
3. Run the smallest targeted proof for that group.
4. Run typecheck when TypeScript/import contracts can change.
5. Record the checkpoint result in Linear for substantial work.
6. Repeat for the next dependency-safe group.
7. Before push/merge, use `pre-commit.md` and the risk-matched `pre-merge-tests.md` matrix.

## Test tiers

| Tier | Use when | Typical proof |
|---|---|---|
| T1 — targeted | one helper/component/tool/contract changed | exact Vitest/contract test(s) |
| T2 — affected domain | shared schema/hook/agent/domain contract changed | affected directory/suite + typecheck |
| T3 — repository gate | PR is ready, shared runtime/config changed, or risk requires it | repository `floor`/CI-equivalent gate |

Verify commands from current `package.json`/CI before running them. Timings and command names drift; the proof class is the contract, not an old benchmark.

## Escalation rule

A failing T1/T2 test is evidence. Reproduce once, classify the smallest failing boundary, fix that boundary, rerun the failing proof, then directly affected neighbors. Escalate to broader suites only when the dependency graph or risk justifies it.

## Efficiency rules retained from the old lean flow

- Do not run `floor`, build, or full E2E after every tiny edit.
- Do not start a dev server for work that has no runtime/browser proof requirement.
- Stage explicit task files; avoid bulk staging when the worktree contains unrelated state.
- Use Playwright for observable user journeys, not as a substitute for unit/contract proof.
- Capture exact command/result/SHA evidence instead of saying only "reviewed" or "looks good".
