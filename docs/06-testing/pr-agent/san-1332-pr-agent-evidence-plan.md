# SAN-1332 PR-Agent Evidence Implementation Plan

> **For agentic workers:** execute natively with TDD, checkpoint by checkpoint.

**Goal:** Build trusted exact-version evidence and inject it into PR-Agent so unsupported framework/API claims become advisory.

**Architecture:** A trusted Node evidence builder reads changed-file input plus base/head lockfiles, emits bounded markdown evidence, and the GitHub workflow passes that file to PR-Agent. Policy and contract tests enforce provenance, confidence states, token-budget completeness, and no PR-controlled execution.

**Tech Stack:** Node 24, GitHub Actions, PR-Agent v0.45.0, Vitest, TOML/YAML configuration.

**Spec:** `docs/06-testing/pr-agent/san-1332-pr-agent-evidence-design.md`

## Global Constraints
- Trusted base controls reviewer code/policy/skills.
- Exact resolved versions come from lockfiles, not semver ranges alone.
- Missing evidence => `NEEDS VERIFICATION`, never unsupported HIGH/BLOCKER.
- No arbitrary dependency prose or PR-controlled scripts.
- Keep normal CI deterministic; live model certification is separate.

## Review Focus
- Dependency changed in head but absent in base.
- Malformed or missing lockfile data.
- Path/domain detection for `src/proxy.ts` and auth files.
- Evidence artifact too large or empty.
- All selected skills must fit configured budget.

### Task 1: Evidence builder
**Files:** create `scripts/pr-agent/build-evidence.mjs`; test `src/__tests__/pr-agent-evidence.test.ts`.
- [ ] RED: tests for exact lockfile versions, base→head changes, domains, provenance, and failure states.
- [ ] GREEN: implement minimal evidence builder/library API and CLI.
- [ ] Verify targeted tests.

### Task 2: Workflow artifact wiring
**Files:** modify `.github/workflows/pr-agent.yml`, `.pr_agent.toml`; extend contract test.
- [ ] RED: contract assertions for artifact build/injection and fail-closed policy.
- [ ] GREEN: generate artifact from trusted code and pass it to reviewer.
- [ ] Verify targeted tests.

### Task 3: Skill-budget and regression gates
**Files:** extend tests and review policy only where required.
- [ ] RED: assert selected skills fit budgets and `proxy.ts`/`getClaims()` evidence controls.
- [ ] GREEN: minimal routing/budget/policy changes if tests expose gaps.
- [ ] Verify targeted tests.

### Task 4: Full verification
- [ ] Run targeted tests, typecheck, lint, build, unit suite, `check:mastra`, audit/Floor.
- [ ] Re-read final diff and verify no unrelated changes.
- [ ] Record blockers separately if baseline/external failures remain.
