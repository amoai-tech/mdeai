# MDE Skills Index

Canonical skill root: `.claude/skills/`

This scorecard evaluates the post-PR #107 skill architecture against current MDE usage and Anthropic Skill Creator guidance:
https://github.com/anthropics/claude-plugins-official/blob/main/plugins/skill-creator/skills/skill-creator/SKILL.md

## Score meaning

Scores are audit scores, not benchmark pass rates. They combine:
- trigger/ownership clarity
- current MDE correctness
- progressive disclosure and context size
- duplication/overlap risk
- references/scripts reuse
- eval/test coverage

| Score | Meaning |
|---:|---|
| 95–100 | Production-strong; maintain and benchmark |
| 90–94 | Strong; small improvements |
| 80–89 | Useful but needs targeted cleanup/evals |
| 70–79 | Significant overlap or maintenance risk |
| <70 | Consolidate, move, or remove from active discovery |

## Current architecture

`tasks` owns task lifecycle/execution. `task-verifier` independently proves merge safety and Done. Domain skills remain specialist owners; `code-review` owns universal PR/diff review.
## Skill scorecard

| Skill | Score /100 | Decision | Main improvement |
|---|---:|---|---|
| `cloudinary` | 89 | KEEP CONDITIONAL | Verify Cloudinary is actually active before triggering |
| `code-review` | 98 | KEEP | Universal PR/diff review; CI-specific invariants live in `references/ci-review.md` |
| `copilotkit` | 97 | KEEP | Maintain version/source verification and v2 entrypoint accuracy |
| `events` | 91 | KEEP | Add domain references only as event rules grow |
| `gemini` | 96 | KEEP | Maintain current-model/provider evidence |
| `maps` | 94 | KEEP + IMPROVE | Add trigger and behavior evals |
| `mastra` | 97 | KEEP | Maintain package-family/runtime verification |
| `mermaid-diagrams` | 93 | KEEP + IMPROVE | Add 2–3 realistic diagram-selection evals |
| `nextjs` | 98 | KEEP + BENCHMARK | Single Next.js/Vercel domain owner; review/deploy/performance detail uses progressive-disclosure references |
| `playwright-cli` | 86 | KEEP + CLARIFY | Browser execution specialist; `testing` owns test strategy |
| `real-estate` | 94 | KEEP + IMPROVE | Canonical superskill is consolidated; add realistic domain evals |
| `research` | 95 | KEEP | Maintain primary-source/evidence discipline |
| `stripe` | 94 | KEEP | Maintain payment/idempotency safety |
| `supabase` | 98 | KEEP | Strong canonical owner; maintain live-schema evidence |
| `systematic-debugging` | 96 | KEEP | Maintain root-cause-before-fix behavior |
| `task-verifier` | 98 | KEEP + BENCHMARK | Add explicit Quick/Standard/Adversarial eval suite |
| `tasks` | 98 | KEEP + BENCHMARK | Add lifecycle/worktree/PR/post-merge eval suite |
| `testing` | 97 | KEEP | Single owner for TDD, test strategy, execution, interpretation, and regression proof |
| `using-mde-skills` | 96 | KEEP + EXPAND EVALS | Add near-miss trigger tests and ownership conflicts |
| `wireframe` | 91 | KEEP + IMPROVE | Add responsive/AI-HITL design evals |
| `writing-skills` | 94 | KEEP | Keep aligned with Anthropic eval/benchmark workflow |

**Overall audit score: 92.9/100.**

## Remove / consolidate decisions

| Candidate | Decision | Reason |
|---|---|---|
| former `mde-vercel` + former `nextjs-review` + `nextjs` | Consolidated | `nextjs` is the single domain owner; Vercel, performance, and review invariants load from `nextjs/references/` |
| `testing` + former `tdd` | Consolidated | `testing` now owns TDD, strategy, execution, interpretation, and regression proof |
| `code-review` + former `ci-review` | Consolidated | CI review invariants now live under `code-review/references/ci-review.md` |
| `playwright-cli` + `testing` | Do not merge | `testing` chooses proof strategy; `playwright-cli` executes browser work |
| former specialist `*-review` skills | Consolidated | Domain-specific invariants live with the domain owner; universal PR/diff review lives in `code-review` |
## Task 1 · Highest-priority actions

1. **Keep skill-integrity CI mandatory** — fail when `.agents/skills` contains real files, symlinks break, a canonical skill lacks `SKILL.md`, frontmatter names mismatch, retired owners reappear, or stale repo paths return.
2. **Expand routing evals** — add realistic positive + near-miss cases to critical routers and domain owners.
3. **Benchmark critical owners** — especially `tasks`, `task-verifier`, `using-mde-skills`, and consolidated domain owners.
4. **Benchmark consolidated `nextjs`** — exercise framework, Vercel, performance, and review-reference trigger/collision cases.
5. **Clarify `testing` ↔ `playwright-cli`** — `testing` selects the proof ladder; `playwright-cli` performs browser automation and Playwright-specific mechanics.
6. **Keep templates and archives outside active discovery** — template content lives in `docs/templates/skill/`; retired Linear material lives in `docs/_archive/skills/linear/`.
7. **Benchmark `real-estate`** — the duplicate has already been consolidated on current `main`; add realistic marketplace, MLS-near-miss, lead, and neighborhood evals.

## Task 2 · Anthropic best-practice checkpoints

Use these rules for every skill change:

- Keep `name` + `description` accurate; the description must say both **what** the skill does and **when** it should trigger.
- Prefer `SKILL.md` under ~500 lines; move detailed material to `references/` and deterministic work to `scripts/`.
- Use imperative, reusable instructions and explain why important constraints exist.
- Create 2–3 realistic eval prompts for new or materially changed skills.
- For existing skills, compare the changed skill against an old snapshot/baseline instead of judging only the new output.
- Add objective assertions when the output is objectively verifiable; use human review for subjective quality.
- Optimize descriptions with realistic should-trigger and should-not-trigger queries, especially near-misses.

Reference: https://github.com/anthropics/claude-plugins-official/blob/main/plugins/skill-creator/skills/skill-creator/SKILL.md
