# SAN-1273 Lightweight Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the smallest MDE routing control plane that chooses one execution owner, preserves S4 independent verification, and leaves execution sequencing to existing workflow skills.

**Architecture:** `using-mde-skills` acts only as an ambiguity router. Obvious domain requests bypass it; ambiguous substantial work routes to `tasks`; failure/research/review/Done claims route to existing canonical workflow skills. S4 requests require independent verification and cannot self-certify.

**Tech Stack:** Markdown skill instructions, JSON eval fixtures, Python deterministic contract test, existing MDE `.claude/skills` layout.

**Spec:** Linear SAN-1273 — https://linear.app/amo100/issue/SAN-1273/mde-skills-002-simplify-orchestration-using-proven-skill-subagent

## Global Constraints

- Base from verified `origin/main` SHA `bc712cbb9a63b3a2758e4076455acf722658ed37` unless remote main advances before implementation.
- Do not modify dirty `/home/sk/mdeai` checkout.
- Router chooses one owner and stops.
- No old PR #45 eight-field schema, support matrix, adaptive routing memory, router-owned Linear handoff, parallelization, or execution-step schema.
- S4 cannot self-certify.
- Runtime files stay untouched unless a failing test proves compatibility work is necessary.

---

### Task 1: Deterministic Routing Contract

**Files:**
- Create: `.claude/skills/using-mde-skills/evals/routing-evals.json`
- Create: `.claude/skills/using-mde-skills/scripts/test-routing-contract.py`

**Interfaces:**
- Consumes: canonical skill directories under `.claude/skills/`
- Produces: machine-checkable routing cases and a test command returning nonzero on contract failure.

- [ ] Write failing deterministic contract test for direct-owner bypass, workflow routing, S0 bypass, S4 detection, S4 no-self-certification, and stale skill rejection.
- [ ] Run the test and confirm RED because router skill/eval files do not yet exist.
- [ ] Add the smallest eval fixture required by the test.
- [ ] Run test and keep RED until router skill exists.
- [ ] Commit once Task 2 makes the contract green.

### Task 2: Minimal `using-mde-skills` Router

**Files:**
- Create: `.claude/skills/using-mde-skills/SKILL.md`
- Optional: `.claude/skills/using-mde-skills/routing.yaml` only if a deterministic data file is proven necessary.

**Interfaces:**
- Consumes: canonical skills from PR #47 and workflow skills from PR #48.
- Produces: one owner selection with S4 verifier requirement metadata/instructions.

- [ ] Implement only enough routing rules to satisfy deterministic contract tests.
- [ ] Run deterministic test and require 10/10 PASS.
- [ ] Run `git diff --check`.
- [ ] Verify no runtime source files changed.
- [ ] Commit `feat: add lightweight mde skill router`.

### Task 3: Behavioral and Vendor Handoff Certification

**Files:**
- Modify only if test evidence proves required: `.claude/skills/using-mde-skills/evals/routing-evals.json`

**Interfaces:**
- Consumes: final Task 2 router.
- Produces: recorded 10-case live routing evidence plus one handoff case each for CopilotKit, Mastra, Supabase, Gemini.

- [ ] Run 10 representative fresh-session prompts and record expected/observed owner and pass/fail.
- [ ] Require 10/10 correct owner behavior.
- [ ] Run one CopilotKit, Mastra, Supabase, and Gemini handoff case.
- [ ] Require no duplicate vendor logic in router.
- [ ] Fix only proven contract gaps and rerun targeted tests.
- [ ] Commit any necessary evidence/fixture adjustments.

### Task 4: Exact-Head Verification and PR Readiness

**Files:**
- No production files expected beyond router control-plane files.

**Interfaces:**
- Consumes: exact branch HEAD.
- Produces: merge-ready evidence.

- [ ] Run frontmatter/link/eval/static checks.
- [ ] Run independent review for owner ambiguity, S4 bypass, self-certification, duplicated policy, and over-engineering.
- [ ] Run final repository Floor once: lint, typecheck, Vitest, Mastra, production build, critical npm audit.
- [ ] Push branch and open/update PR linked to SAN-1273.
- [ ] Resolve only comments proven fixed on exact head.
- [ ] Require GitHub CI green and zero blocker/high findings.
