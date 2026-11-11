---
name: skills
description: Use when designing or optimizing skill files or skill behavior; creates, reviews, and improves reusable agent skills with strong trigger descriptions, concise workflows, progressive disclosure, and realistic evaluations.
---

**SKILLS — Create & Improve Agent Skills**

**Goal**
Create concise, discoverable skills that measurably improve agent performance.

**Define the skill**
- One skill = one reusable job.
- Define what it does, when it should trigger, when it should not, expected output, and mutation authority.
- Split skills when triggers, permissions, or outcomes differ.

**Metadata**
- `name`: lowercase letters/numbers/hyphens; short and specific.
- `description`: state **what it does + when to use it**.
- Put trigger guidance in the description, not deep in the body.

**Keep it lean**
Target **40–80 lines**, ~100 max by default.
Keep SKILL.md to:

**workflow → decisions → critical rules → resources → output**
Move repeated deterministic work to `scripts/`, long guidance to `references/`, templates to `assets/`.

**Match detail to risk**
- High freedom: research/reviews.
- Medium freedom: normal implementation.
- Low freedom: migrations, destructive writes, release procedures.
Use exact steps only when deviation is risky.

**Build from evidence**
Before adding detail:
1. create ~3 realistic evals
2. establish baseline behavior
3. write the minimum instructions needed
4. rerun and compare
5. remove instructions that add no value
For new skills compare with no-skill baseline; for revisions compare with the previous version when practical.

**Test triggering**
Use realistic:
- should-trigger prompts
- near-miss should-not-trigger prompts
Check adjacent skills do not compete incorrectly.

**Improve from failures**
Look for:
- missed triggers
- ignored rules
- wasted work
- repeated helper logic
- stale tools/examples
Generalize fixes; do not overfit to one example.


For remaining steps, checks, and examples, see [full prompt](references/full-prompt.md).
