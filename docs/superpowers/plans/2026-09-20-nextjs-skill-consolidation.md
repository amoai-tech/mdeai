# Next.js Skill Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate `nextjs`, `nextjs-review`, and `mde-vercel` into one canonical `nextjs` skill without breaking workflow routing.

**Architecture:** Keep `nextjs` as the only top-level Next.js/Vercel domain skill. Move review, deployment, and performance guidance into progressive-disclosure references; keep workflow intent owned by `code-review`, `systematic-debugging`, `testing`, and `task-verifier`.

**Tech Stack:** Claude skills Markdown/YAML, Python routing contract, Vitest repository contracts, Git symlink compatibility layer.

**Spec:** `docs/superpowers/specs/2026-09-20-nextjs-skill-consolidation-design.md`

## Global Constraints

- Preserve canonical skill name `nextjs`.
- Remove top-level `nextjs-review` and `mde-vercel` owners and compatibility links.
- Keep `SKILL.md` lean and load deep material from `references/`.
- Workflow intent outranks incidental Next.js/Vercel domain keywords.
- Resolve the installed Next.js version from `package.json`; do not hardcode package versions in trigger metadata.
- Preserve deployment safety: preview by default unless production is explicitly requested.

## Review Focus

- Review prompts mentioning Next.js still route to `code-review`, not `nextjs`.
- Unknown Next.js/Vercel failures route to `systematic-debugging`.
- Production-readiness prompts route to `task-verifier`.
- Direct deployment/performance/framework prompts route to `nextjs`.
- No stale `nextjs-review` or `mde-vercel` owner remains in active routing/docs/symlinks.

### Task 1: Add consolidation regression contract
**Files:** Create `src/__tests__/nextjs-skill-consolidation.test.ts`; modify routing evals.
- [ ] Add failing assertions for retired directories/symlinks, new references, and `nextjs` ownership.
- [ ] Add collision evals for deploy, cache, review, unknown failure, and production proof.
- [ ] Run targeted tests and confirm RED.

### Task 2: Build canonical `nextjs` skill
**Files:** Modify `.claude/skills/nextjs/SKILL.md`; create `references/review.md`, `references/vercel.md`, `references/performance.md`, `references/app-router.md`, `references/caching.md`, `evals/evals.json`.
- [ ] Keep trigger description explicit and pushy for Next.js/Vercel framework work.
- [ ] Add a reference-selection table so only relevant guidance loads.
- [ ] Preserve exact-version review invariants, deployment safety, and performance guidance.
- [ ] Add 3 realistic skill eval prompts.

### Task 3: Retire duplicate owners and update routing
**Files:** Delete `.claude/skills/nextjs-review/**`, `.claude/skills/mde-vercel/**`, matching `.agents` links; modify router/session/PR-Agent contracts as discovered.
- [ ] Add retired names to the routing sentinel.
- [ ] Add direct `nextjs` mapping for Next.js/Vercel/RSC/cache/deploy terms after workflow-intent checks.
- [ ] Update PR-Agent/domain review selection to use `nextjs/references/review.md` under `code-review`.

### Task 4: Update indexes and repository guidance
**Files:** Modify `.claude/skills/INDEX.md`, `index-skills.md`, `AGENTS.md`, `CLAUDE.md`, and any active references found by search.
- [ ] Remove active-owner references to `nextjs-review` and `mde-vercel`.
- [ ] Recompute canonical/compatibility counts.
- [ ] Mark consolidation decision and current ownership clearly.

### Task 5: Verify and ship
- [ ] Run routing contract, session-start tests, targeted consolidation/PR-Agent tests, symlink integrity, lint, typecheck, full Vitest, and `git diff --check`.
- [ ] Search active repo for stale owner references and classify historical/spec references separately.
- [ ] Commit, push, create PR, and report exact head + CI status.
