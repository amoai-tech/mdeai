---
name: uiux
description: Use when evaluating or improving screens, interactions, user flows, loading/error states, mobile layouts, or visual hierarchy; reviews product UI and UX for clarity, usability, accessibility, responsive behavior, and design-system consistency.
---

**UIUX — Product UI/UX Review**

**Goal**
Find the smallest UI/UX changes that make the real user journey clearer, faster, accessible, and consistent.

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
- loading/empty/error/success
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
Use screenshots/browser checks plus real workflow testing when interaction changes.
Check mobile and keyboard/accessibility when relevant.

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
