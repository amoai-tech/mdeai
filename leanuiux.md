# UI/UX Fast Path — Design Once, Build Once, Prove It

**Goal:** Ship complete, polished MDE UI changes with fewer revisions, less agent overhead, and faster *real* verification. Reuse the existing application and task lifecycle; **this is a quick-reference companion, not a new skill, approval gate, or workflow owner**.

**Start here:** [AGENTS.md](./AGENTS.md) owns repository-wide rules. [tasks](./.claude/skills/tasks/SKILL.md) owns implementation and PR lifecycle; [UI review](./.claude/skills/tasks/references/ui-review.md) owns the detailed state matrix; [task-verifier](./.claude/skills/task-verifier/SKILL.md) independently verifies required claims. Where this guide overlaps, those canonical owners win.

**Quick path:** Outcome → reuse check → state/layout decision → smallest complete journey → focused proof → exact-diff review → evidence → ship or stop.

## 1. Run a five-minute preflight

Before editing, answer in a few lines:

- **Outcome:** What can a real user do when this is finished?
- **Baseline:** What works on the relevant page in the current branch/base? Inspect shared components and existing tests.
- **Acceptance:** Choose **3–6 observable** criteria; include a failure/recovery case where relevant.
- **Scope:** Name likely components, routes, tests, and explicitly excluded work.
- **Proof:** Name the cheapest test that will demonstrate the outcome, plus any risk-triggered checks.

Read the existing Linear issue, code and current evidence before researching again. Confirm the actual PR base/merge-base: do not mistake inherited changes for this task's changes.

**Example:** “A renter filters Laureles apartments, sees matching cards and pins, opens Details and requests a viewing. Prove the request persists once and reaches the correct broker.” This is more testable than “improve rental UX.”

**Stop before implementation if:** The proposed UI depends on an unverified API/data contract or creates a second owner for existing state.

## 2. Settle layout, states, and interactions once

For UI-heavy work, decide these before coding. Write a short state matrix or wireframe **only when it removes ambiguity**:

| Decision | Minimum useful agreement |
| --- | --- |
| Layout | Check typical **1440px desktop** and **390px mobile**; also 320px/768px when the component is tight or layout changes materially. |
| States | Normal, loading, empty/no-match, error/retry, not-found/forbidden where relevant. |
| Actions | One clear primary action; honest disabled/busy feedback; secondary actions do not compete. |
| Navigation | Filters, selected item, query parameters, back/forward, sign-in return, deep links. |
| State owner | Which existing component/store/URL/API owns selection and results; no shadow state. |
| Access | Keyboard order, visible focus, readable labels, touch targets, and reduced motion where applicable. |

Use existing MDE design tokens and shared UI components. Avoid redesigning an interaction midway through implementation without recording the concrete new requirement.

**MDE-specific contract:** For rentals/events/venues, card selection, map pin selection, Details and Ask MDE must reference the **same grounded record**. Filters and URL state must not disagree with the visible result set. Where a map is not keyboard-accessible, keep an equivalent accessible list/action path.

## 3. Give one owner responsibility for implementation

- One primary agent owns the outcome and coordinates edits.
- Prefer **up to three relevant specialist skills**, unless a genuine security/domain requirement needs more. Do not invent a new UI lifecycle skill or agent.
- Delegate only independent work (for example, a read-only UX inspection while a separate agent checks tests). Do not let agents edit the same files or separately redefine interaction rules.
- Reviewers challenge evidence and identify reproducible defects, not restart settled design decisions without new facts.

Use the existing `tasks` → domain skill → `task-verifier` responsibilities. Keep the handoff in the existing Linear task when that task is the owner; avoid duplicate issues and evidence ledgers.

## 4. Build the smallest **complete** vertical slice

Work in this order:

1. **Reuse:** Existing cards, layouts, design tokens, API/server actions, Supabase contracts, CopilotKit/Mastra integration, and Playwright helpers.
2. **Connect the user path:** Page → action → navigation/API → actual result. Don't stop at a pretty screenshot or a mocked success toast.
3. **Handle realistic states:** Missing images/data, empty results, authorization, retry, slow responses, and truthful external-source attribution.
4. **Add one focused regression:** Primary success **and** the most likely failure; verify durable side effects when the journey writes data.
5. **Polish:** Hierarchy, spacing, readable text, responsive overflow, accessible labels, focus, and interaction feedback.
6. **Simplify:** Remove duplicate state, dead actions, speculative abstractions, and unrelated changes before review.

Prefer **one cohesive PR** for a single user-visible outcome, including its tests and corrections. Split only at a real independent delivery, risk, dependency or ownership boundary.

**Prelaunch rule:** Do not add business approval, ownership/verification, publishing, photo-rights, rental eligibility, or booking gates during MDE Phase A. Preserve authentication, server-side authorization, RLS/privacy, integrity, atomic writes, idempotency and audit trails. Never fabricate availability, map coordinates, ownership, payments or success.

## 5. Prove it with the cheapest decisive tests

Apply the existing D/C/U/S **verification tiers** (separate from `tasks`' S0–S4 complexity classification):

| Change | Fast first proof | Add when risk requires |
| --- | --- | --- |
| **D — Docs** | Markdown, relative links, relevant diagram validity | Docs checker if the path is in its scope |
| **C — Code/data** | Focused unit/API test, typecheck for touched contract | Integration/DB permission, retry or negative test |
| **U — UI** | Primary browser journey + likely failure, 390px and desktop, screenshot where useful | Cross-page/shared component regression, keyboard/ARIA/console/network |
| **S — Shipping** | Exact-HEAD CI and deployed SHA provenance | Real deployed journey, safe transactions, rollback/recovery |

**Browser test rules:**

- Use Playwright's `getByRole`, `getByLabel`, and auto-retrying `expect(...).toBeVisible()`/URL assertions. Wait for actual states rather than sleeping for fixed milliseconds.
- Use isolated, deterministic data and safe cleanup. Do not depend on today's live event inventory; never call mock-only behavior a real integration pass.
- Verify **both visual and functional results**: no 390px horizontal overflow, usable primary CTA, correct selected item, accessible name/focus, no unexpected console/network failure.
- For state-changing actions, verify the **actual persisted record** and retry/idempotency (for example, one lead or one ticket, not two).
- Check WCAG 2.2 AA-relevant behaviors: keyboard usability, visible/unobscured focus, sufficient contrast, meaningful labels and touch target spacing. Automated checks support but do not replace manual interaction review.
- For performance-sensitive changes, check loading and responsiveness; use LCP, INP, CLS where measurements are available. Avoid making a new universal performance gate for every small UI task.

Rerun the smallest impacted check after each edit. Run broader checks at integration/release or when shared components or risk justify them. `npm run floor` remains the canonical full repository gate; skipping it locally is not a claim it passed.

## 6. Stop review churn

Before requesting review:

- Compare the exact PR diff to its **real** base/merge-base, inspect filenames, and exclude unrelated/inherited changes.
- Run formatting, focused tests, and relevant static analysis. Keep fixtures/selectors deterministic.
- Match the implementation to the acceptance criteria, including negative and mobile states.
- Write a reviewer-friendly PR body: user outcome, real journey, files changed, exact tests, non-goals, post-merge proof.

Triage findings **once**, against the current head:

| Finding | Action |
| --- | --- |
| Reproduced in-scope defect | Fix the smallest cause; rerun its proof |
| Valid but outside scope | Record on an existing owner/task; don't sneak it into this PR |
| Stale / previous SHA | Recheck current code and show evidence |
| False positive | Explain with proof; don't broadly suppress analysis |
| Uncertain | Reproduce or inspect before changing code |

Re-review if relevant code or evidence changes, not because an unchanged bot summary exists. A skipped job or old-green commit is **not** current-head proof.

## 7. Keep one concise evidence record

For U/S tasks, use the existing evidence location/Linear handoff, not a new parallel tracker. Record **only checks actually run**:

- Acceptance result for each applicable criterion: passed, failed, blocked, or not tested.
- Exact commands and outcomes; relevant CI checks and the SHA they evaluated.
- Desktop/mobile screenshots when they show a real design claim (remove personal/private data).
- Browser URL/environment, PR/commit, deployed SHA if claiming production.
- Remaining reproducible defects, untested risks, and next action.

Do not equate commit count, merge, bot approval, or estimated percentage with working software. Use verified criteria to update Linear status.

## 8. Stop when the outcome is proven

Stop expanding scope when the requested journey works, applicable risk-matched checks pass, no in-scope reproducible blocker remains, and optional improvements have an existing owner or can be recorded for later.

Don't turn a UI task into a platform rewrite, new agent framework, extra infrastructure, speculative refactor, or **Phase B public-launch certification**. Technical safety and truthful state still apply.

## Small improvement loop (every 3–5 UI PRs)

Measure change against a recent comparable baseline rather than inventing a score:

- **Revision rounds per PR:** how often code needed another review/fix cycle.
- **Time to verified acceptance:** first implementation → last acceptance criterion actually passed.
- **Post-merge regressions:** bugs caused by these UI changes, including mobile and shared-state errors.

If rework rises, identify the missing upfront decision or flaky test and improve **the existing owner**. Don't add another checklist, tool, or mandatory agent by default.

## Official references

- [Playwright: test user-visible behavior, resilient locators and isolated tests](https://playwright.dev/docs/best-practices) — use when implementing focused browser proof.
- [Playwright: actionability and auto-waiting](https://playwright.dev/docs/actionability) — use instead of fixed delays.
- [W3C: WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) — use for keyboard/focus/contrast/target-size checks.
- [web.dev: Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds) — consult only for performance-sensitive work.
- [GitHub: helping others review your changes](https://docs.github.com/en/pull-requests/concepts/helping-others-review-your-changes) — keep the PR small, scoped and evidence-led.

**Operating principle:** Verify what's already there → settle only the decisions that matter → build one complete journey → prove it cheaply and honestly → review the exact diff → ship or stop.
