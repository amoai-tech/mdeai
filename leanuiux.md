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

**Example:** “A renter filters Laureles apartments, sees matching cards and pins, opens Details and requests a viewing. Read back **exactly one persisted lead and one linked showing**, prove the correct broker can see the request, and confirm retries do not create duplicates.” This is more testable than “improve rental UX.”

**Stop before implementation if:** The proposed UI depends on an unverified API/data contract or creates a second owner for existing state.

## 2. Settle layout, states, and interactions once

For **UI-heavy work, document a compact state matrix or wireframe** with expected behavior for each applicable state, as required by [UI review](./.claude/skills/tasks/references/ui-review.md). A small table is enough; avoid decorative diagrams, not the state decisions:

| Decision | Minimum useful agreement |
| --- | --- |
| Layout | Verify **1440px desktop, 768px tablet, 375px phone**; add **390×844** for MDE mobile journeys when applicable. Check 320px for tight layouts. |
| States | Define **Normal**, **Loading**, **Empty dataset**, **No match after search/filter**, **Error with retry**, and **Forbidden** and **Not found** separately where applicable. Record the expected behavior for each. |
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
3. **Handle realistic states:** Missing images/data, empty datasets versus filter no-match, authorization/not-found, retry, slow responses, and truthful external-source attribution.
4. **Add focused regressions:** Primary success **and** the most likely failure. When React state, validation or interaction logic changes, include a component/unit test **and** user-visible Playwright proof. Read back durable writes; for a rental viewing prove **exactly one lead plus its linked showing** and correct broker visibility, including retry safety.
5. **Polish:** Hierarchy, spacing, readable text, responsive overflow, accessible labels, focus, and interaction feedback.
6. **Simplify:** Remove duplicate state, dead actions, speculative abstractions, and unrelated changes before review.

Prefer **one cohesive PR** for a single user-visible outcome, including its tests and corrections. Split only at a real independent delivery, risk, dependency or ownership boundary.

**Prelaunch rule:** Follow the complete [AGENTS.md Phase A policy](./AGENTS.md#mandatory--prelaunch-development-comes-before-launch-certification). No moderation, freshness, partner/listing/photo approval, rental eligibility, ownership or owner/broker verification, photo-rights paperwork, publishing, viewing or booking business gates during development. Preserve authentication, server-side authorization, RLS/privacy, integrity, atomic writes, idempotency and audit trails. Never fabricate availability, coordinates, ownership, payments or action success.

## 5. Prove it with the cheapest decisive tests

Use the established D/C/U/S [change classes in lean.md](./lean.md#change-classes), **not a new classification** (separate from the `tasks` S0–S4 complexity scale). Classes are risk-aware, and the [canonical pre-merge matrix](./.claude/skills/tasks/references/pre-merge-tests.md) always supplies domain-specific proof: C already includes lib/API/migration; U includes chat/cards/maps/agents; S refers to PR shipping, P0 and production claims.

| Change | Cheapest proof first | Required evidence when applicable |
| --- | --- | --- |
| **D — Docs** | Markdown, internal links, relevant diagrams | Docs/skills checks and exact-head required CI |
| **C — Code/API/migration** | Focused unit/contract test, typecheck, targeted runtime check | SQL/RLS/auth/tenant and persistence/idempotency checks for impacted backend/schema contracts; build if runtime wiring changes |
| **U — UI/chat/map/agent journey** | Focused component/unit regression **when behavior changes**, plus Playwright primary journey and likely failure | Screenshots and browser evidence; **1440px, 768px, 375px, plus 390×844 if applicable**; keyboard/focus/touch targets; console/network; relevant agent/DB contracts and cross-page regression |
| **S — Shipping/P0/production claim** | Relevant D/C/U proof and **exact-head required CI + applicable PR-bot review** | Required production smoke, deployed SHA provenance, real affected journey, recovery/rollback where relevant; use the [post-merge standard](./.claude/skills/tasks/references/post-merge.md) |

**Browser test rules:**

- Use Playwright's `getByRole`, `getByLabel`, and auto-retrying `expect(...).toBeVisible()`/URL assertions. Wait for actual states rather than sleeping for fixed milliseconds.
- Use isolated, deterministic data and safe cleanup. Do not depend on today's live event inventory; never call mock-only behavior a real integration pass.
- Verify **both visual and functional results** at 1440px, 768px, 375px and 390×844 when applicable: no horizontal overflow, usable CTA and touch targets, correct selection, accessible name/focus, and no unexpected console/network error. Capture required UI screenshots/traces in the existing evidence location.
- For state-changing actions, verify **actual persisted records** and retry/idempotency: rental viewing = **one lead and one linked showing**, visible to the correct broker; paid ticket = one durable ticket after safe payment. Never infer persistence from a toast.
- Check WCAG 2.2 AA-relevant behaviors: keyboard usability, visible/unobscured focus, sufficient contrast, meaningful labels and touch target spacing. Automated checks support but do not replace manual interaction review.
- For performance-sensitive changes, check loading and responsiveness; use LCP, INP, CLS where measurements are available. Avoid making a new universal performance gate for every small UI task.

Rerun the smallest impacted check after each edit. Run broader checks at integration/release or when shared components or risk justify them. `npm run floor` remains the canonical full repository gate; skipping it locally is not a claim it passed.

## 6. Stop review churn

Before requesting review:

- Compare the exact PR diff to its **real** base/merge-base, inspect filenames, and exclude unrelated/inherited changes.
- Run formatting, focused tests, and relevant static analysis. Keep fixtures/selectors deterministic.
- Match the implementation to the acceptance criteria, including negative and mobile states.
- Apply the **full canonical [GitHub PR checklist](./.claude/skills/tasks/references/github-pr.md)**: user outcome, faster/better approach, real journey (or no visible change), changed files/purpose, source/reuse receipts, exact tests, **reviewer fast path**, non-goals and post-merge checks; add security/data diagrams only when relevant.

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
- Required desktop/mobile screenshots/traces for applicable UI/shipping claims, **redacted before sharing**; never include personal data, cookies, tokens or authorization headers.
- **Sanitized browser URL** (origin and safe path, or redacted example), environment, PR/commit and deployed SHA for production claims. **Strip credentials, signed/bearer tokens, sensitive path/query values and fragments** before posting URLs in Linear, PRs or evidence files. Never paste raw callback/redirect or session links.
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
