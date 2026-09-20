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

`tasks` owns task lifecycle/execution. `task-verifier` independently proves merge safety and Done. Domain and review skills remain specialist owners; do not collapse them into one giant skill.
## Skill scorecard

| Skill | Score /100 | Decision | Main improvement |
|---|---:|---|---|
| `_template` | 62 | MOVE / EXCLUDE | Keep as authoring template but remove from active skill discovery |
| `ci-review` | 88 | KEEP + IMPROVE | Add realistic review-routing/eval cases |
| `cloudinary` | 89 | KEEP CONDITIONAL | Verify Cloudinary is actually active before triggering |
| `code-review` | 95 | KEEP | Maintain exact-head and evidence-first review behavior |
| `copilotkit` | 97 | KEEP | Maintain version/source verification and v2 entrypoint accuracy |
| `copilotkit-review` | 91 | KEEP + IMPROVE | Add adversarial review evals |
| `events` | 91 | KEEP | Add domain references only as event rules grow |
| `gemini` | 96 | KEEP | Maintain current-model/provider evidence |
| `maps` | 94 | KEEP + IMPROVE | Add trigger and behavior evals |
| `maps-review` | 90 | KEEP + IMPROVE | Add API-key/cost/grounding review evals |
| `mastra` | 97 | KEEP | Maintain package-family/runtime verification |
| `mastra-review` | 92 | KEEP + IMPROVE | Add tenant/HITL/persistence review evals |
| `mde-real-estate` | 58 | PROTECTED LEGACY | Eventual consolidation into `real-estate`; do not modify under current constraint |
| `mde-vercel` | 78 | IMPROVE / NARROW | Own Vercel deployment/platform only; remove Next.js-performance overlap |
| `mermaid-diagrams` | 93 | KEEP + IMPROVE | Add 2–3 realistic diagram-selection evals || `nextjs` | 94 | KEEP | Keep framework ownership separate from Vercel deployment |
| `nextjs-review` | 90 | KEEP + IMPROVE | Add server/client, cache, auth-boundary evals |
| `playwright-cli` | 86 | KEEP + CLARIFY | Browser execution specialist; `testing` owns test strategy |
| `real-estate` | 87 | IMPROVE | Add domain references/evals before legacy consolidation |
| `research` | 95 | KEEP | Maintain primary-source/evidence discipline |
| `stripe` | 94 | KEEP | Maintain payment/idempotency safety |
| `stripe-review` | 91 | KEEP + IMPROVE | Add webhook/replay/authority review evals |
| `supabase` | 98 | KEEP | Strong canonical owner; maintain live-schema evidence |
| `supabase-review` | 93 | KEEP + IMPROVE | Add RLS/grant/migration review evals |
| `systematic-debugging` | 96 | KEEP | Maintain root-cause-before-fix behavior |
| `task-verifier` | 98 | KEEP + BENCHMARK | Add explicit Quick/Standard/Adversarial eval suite |
| `tasks` | 98 | KEEP + BENCHMARK | Add lifecycle/worktree/PR/post-merge eval suite |
| `tdd` | 95 | KEEP | Maintain RED → GREEN → REFACTOR evidence |
| `testing` | 94 | KEEP + CLARIFY | Own strategy; delegate browser mechanics to `playwright-cli` |
| `using-mde-skills` | 96 | KEEP + EXPAND EVALS | Add near-miss trigger tests and ownership conflicts |
| `wireframe` | 91 | KEEP + IMPROVE | Add responsive/AI-HITL design evals |
| `writing-skills` | 94 | KEEP | Keep aligned with Anthropic eval/benchmark workflow |

**Overall audit score: 90.7/100.**

## Remove / consolidate decisions

| Candidate | Decision | Reason |
|---|---|---|
| `_template` | Remove from active discovery, keep template content | A template should not compete for triggering as a real skill |
| `mde-real-estate` → `real-estate` | Consolidate later | Duplicate domain ownership; currently protected from modification |
| `mde-vercel` + `nextjs` | Do not merge | Narrow `mde-vercel` to Vercel platform/deploy; keep `nextjs` framework-specific |
| `playwright-cli` + `testing` | Do not merge | `testing` chooses proof strategy; `playwright-cli` executes browser work |
| specialist `*-review` skills | Do not merge | They keep PR review context small and domain-specific |
## Task 1 · Highest-priority actions

1. **Merge PR #107 first** — it removes the redundant lifecycle skills and makes this index accurate for the intended canonical tree.
2. **Add skill-integrity CI** — fail when `.agents/skills` contains real files, symlinks break, a canonical skill lacks `SKILL.md`, frontmatter names mismatch, retired owners reappear, or stale repo paths return.
3. **Add eval coverage to critical routers/owners** — `tasks`, `task-verifier`, `using-mde-skills`, `maps`, and specialist review skills should have realistic positive + near-miss cases.
4. **Narrow `mde-vercel`** — deployment, environment, domains, releases, and Vercel runtime only. Route React/Next.js performance rules to `nextjs`.
5. **Clarify `testing` ↔ `playwright-cli`** — `testing` selects the proof ladder; `playwright-cli` performs browser automation and Playwright-specific mechanics.
6. **Move `_template` out of active discovery** — retain it as authoring infrastructure, not a triggerable skill.
7. **Real-estate consolidation later** — benchmark `real-estate` against protected `mde-real-estate`, then migrate only after explicit approval.

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