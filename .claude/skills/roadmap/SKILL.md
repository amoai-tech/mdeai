---
name: roadmap
description: Use when sequencing work, identifying the critical path, or deciding what to defer or remove; builds a concise dependency-ordered product or engineering roadmap from verified goals and current delivery state.
---

**ROADMAP — Strategy & Sequencing**

**Goal**
Turn verified product goals into the smallest dependency-ordered roadmap.

**1. Define the outcome**
State:
- product/user result
- target milestone/launch
- constraints

**2. Verify current truth**
Use:
- PRD for requirements
- roadmap for strategy
- mvp.md for launch gates
- Linear for execution state
- current main/production for delivered truth

**3. Classify work**
- 🔴 Required now
- 🟡 Supporting
- 🟢 Complete
- ⚪ Later
- ❌ Remove/obsolete
Do not classify from Linear status alone.

**4. Sequence dependencies**
Order work by:

**blocker → dependency → user journey → reliability/security → polish**
Prefer finishing a usable vertical slice over starting many parallel tracks.

**5. Cut low-value work**
Ask:
- Can users safely complete the core journey without this?
- Does this reduce launch risk or add measurable value?
- Is an existing task/system already solving it?
Move nonessential polish and speculative infrastructure later.

**Output**

**Goal**
Target outcome.

**Current state**
Only verified facts.

**Critical path**
Dependency-ordered work.

**Cut/defer**
Work not needed now.

**Risks**
Material blockers.

**Success**
Observable milestone condition.

**Next task**
Exact highest-value task.

**Rules**
- Sequence for outcomes, not task count.
- Current truth beats stale planning docs.
- Reuse before adding new work.
- Keep the roadmap short.
