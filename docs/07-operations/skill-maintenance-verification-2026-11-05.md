# MDE Skills — maintenance and evaluation evidence (2026-11-05)

## Real-world outcome

A developer opening a testing guide should be able to follow all links from either the Claude or agent skills tree; a false-trigger check for a simple HTTP definition should pass without claiming the agent invoked an imaginary skill. These improvements use the existing checker and evaluation runner, not a second skills framework.

## Scope and isolation

- Canonical GitHub `main` checked out in an isolated clean worktree for the PR. The existing development checkout was left on its feature branch, including its unrelated tracked/untracked edits.
- Local-only repair: two newly installed vendor skills (`better-design`, `deepsource`) were copied to a temporary backup and moved into the canonical `.claude/skills` location; their `.agents/skills` entries now use relative symlinks. Local `npm run check:skills` passes with 61 skills. This local-only vendor installation is **not** part of the PR.

## Automated behavior / safety proof

- Red-first regression: `scripts/__tests__/check-skill-layout.test.mjs` caught a broken link inside `references/tdd.md` which the old checker missed. After the fix, valid nested links, missing links, external links and inline/fenced-code examples behave correctly.
- Red-first regression: `scripts/__tests__/skill-behavior-runner.test.mjs` caught the incorrect requirement for a fictional `direct` skill call in a no-trigger case. The evaluator now requires **no skill call at all** for direct-answer controls (including unrelated skills); a genuine alternate owner must still be called and produce a successful result.
- Existing safety cases reject forged skill catalog content, missing tool calls, tool-result failures, unrelated or stale turns, incomplete turns, and unexpected calls on a negative control.
- `npm run check:skills` and focused Node tests pass. These are code/fixture checks, **not** independent live-model routing measurements.

## Live agent evaluation attempts — blocked, not passed

| Attempt | Input | Outcome | Conclusion |
| --- | --- | --- | --- |
| DSH headless | `python3 scripts/run-skill-behavior-eval.py --skill errors --trigger-id 1 --run --timeout 100` | Runner returned `MISSING_CREDENTIAL` before obtaining a trace | No skill call or agent completion can be established |
| Claude Code CLI | Read-only authentication status | Not logged in | Cannot run Claude-based skill evaluation |
| Codex CLI | `timeout 100s codex exec --json -s read-only -C <clean-worktree> "Our web app started returning 500 after deploy. Diagnose the failure; no code changes."` | Exit 124; no JSON events or completed turn | Login is present but this read-only attempt produced no gradeable result |

**No valid live-model trace was obtained.** Do not cite the 314 test definitions or passing deterministic tests as a real-world model selection success rate. No overlap descriptions are edited without baseline/candidate evidence.

## Next measurement after runtime access is restored

1. Choose a fixed representative set from existing positive, negative, direct-answer, alternate-owner, and S4 security probes. Avoid destructive or live-DB-writing prompts; run in read-only mode.
2. For each prompt capture model/version, tool and skill calls, permissions, exact commit, trace and completed outcome.
3. Grade wrong-skill invocation, missed skill, unauthorized write attempts, and successful read-only completion, not just final prose.
4. Compare any proposed trigger-description change with this baseline on the same prompts. Do not consolidate `skills`/`writing-skills` or `mermaid`/`mermaid-diagrams` until the paired runs demonstrate a repeatable improvement.

## Official references

- Anthropic skill best practices: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices — concise descriptions, progressive disclosure, testing across models.
- Anthropic skill creator: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md — create prompts, evaluate real runs, iterate based on recorded failure.
