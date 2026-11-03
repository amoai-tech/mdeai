---
name: uiux
description: Use when auditing an existing MDE screen or user journey for usability, interaction states, mobile/accessibility problems, or small UX corrections; identifies focused fixes using existing components, not a new visual identity or substantial redesign.
---

**UIUX — Product UI/UX Review**

**Goal**
Find the smallest UI/UX changes that make the **existing** user journey clearer, faster, accessible, and consistent.

**Owner and boundary:** Review current screens, prioritize observable usability problems and propose focused changes. For a new screen or substantial visual redesign, use [frontend-design](../frontend-design/SKILL.md) as the visual owner; this skill can provide a read-only UX critique without becoming a second implementation workflow. [tasks](../tasks/SKILL.md) owns implementation and PR execution.

**Grounding:** Check [DESIGN.MD](../../../DESIGN.MD), [current tokens](../../../src/app/globals.css) and existing components. For UI-heavy work, use the canonical [UI review/state-matrix standard](../tasks/references/ui-review.md) and [pre-merge proof matrix](../tasks/references/pre-merge-tests.md) instead of copying those standards into this skill.

**1. Define the journey**
State:
- user
- task
- entry point
- expected completion
- device/context

**2. Inspect the current experience**
Review only the load-bearing screens/states:
- hierarchy/content
- navigation
- forms/actions
- loading, distinct empty/no-match, error/recovery, success and unavailable states where relevant
- responsive/mobile
- accessibility
- consistency with existing design system

**3. Prioritize user-impact problems**
Classify:
- 🔴 blocks completion/confuses critical action
- 🟡 slows or weakens confidence
- ⚪ polish only
Focus on observable user impact, not aesthetic preference.

**4. Reuse existing design patterns**
Prefer:

**existing component/token/pattern → configure → adapt → minimal new UI**
Do not create a second design system.

**5. Check interaction truth**
Ensure UI does not:
- show success before durable success
- invent unavailable data
- expose actions user cannot perform
- hide failure/retry state

**6. Verify**
Verify findings against the current browser/UI and actual user journey rather than treating screenshots as proof of persistence. For changed interaction/state behavior, use a focused component regression plus Playwright where applicable; follow the linked canonical test matrix. Check responsive layouts, keyboard/focus and accessibility for the affected UI, and record what was not tested.

**Output**

**Verdict**
Main UX issue in 1–2 sentences.

**Findings**
Ordered by user impact.

**Fix**
Smallest design/code changes.

**Reuse**
Existing components/patterns to use.

**Verification**
How to prove improvement.

**Next step**
Highest-value change.

**Rules**
- User task over visual novelty.
- Existing design system first.
- No speculative redesign.
- Separate blocker fixes from polish.
