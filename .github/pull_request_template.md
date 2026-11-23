<!--
MDE AI — one independently testable PR outcome. Remove optional fields/rows that do not apply.
Before merge, leave post-merge boxes unchecked. After merge, record actual results in the PR body.
Follow AGENTS.md and .claude/skills/tasks/references/github-pr.md; preserve existing PR body edits.
-->

## 1. Purpose

**Purpose:** [What problem does this PR solve, and why is it needed?]

**Expected outcome:** [What will work better for users?]

**Real-world example:** [User] → [action] → [visible result; persisted result if relevant].

**Linear:** [`Closes SAN-#### · SPEC-ID — Exact verified title` if fully completed; `Part of SAN-#### · SPEC-ID — Exact verified title` for partial work; otherwise N/A.]

**Type / Tech stack:** [Runtime / Tests / Docs / Infrastructure] · [Only affected technologies]

## 2. Changes & Improvements

**Implemented**
- [Main change]
- [Second change, if needed]
- [Third change, if needed]

**Existing functionality reused:** [Current components, APIs, RPCs, agents or tools; why this is the simplest solution.]

**Files to review:** [Up to 3–5 important paths → what to check.]

**How to reproduce:** [Exact user steps, preview URL or test command.]

**Risks / limitations:** [Material risks, missing proof and exclusions, or N/A.]

<!-- Add Mermaid only if a complex flow needs explanation. Include material external source receipts per AGENTS.md only when relevant. -->

## 3. Success Criteria

<!-- Replace with 1–4 task-specific, observable requirements. Check only with evidence. -->
- [ ] [Primary feature or change behaves correctly.]
- [ ] [Results are accurate/persisted, when applicable.]
- [ ] [Relevant error, retry, authorization or security behavior passes.]
- [ ] [Affected real user journey passes, when applicable.]

## 4. Tests & Evidence

**Tested PR head:** [Exact commit SHA]

| Check | Result | Evidence / environment / SHA |
| --- | --- | --- |
| Focused tests | NOT RUN | [Command, results and link] |
| GitHub CI: `floor` | PENDING | [Run link and exact head SHA] |
| GitHub CI: `mastra-schema-init` | PENDING | [Run link and exact head SHA] |
| GitHub CI: `review / verify-review-result` | PENDING | [Run link and exact head SHA] |
| Playwright / browser, if relevant | N/A | [Preview URL, screenshot/test, or reason] |
| Supabase / API / integrations, if relevant | N/A | [Query, test, or reason] |

**Unverified:** [Outstanding proof, or None.]

<!-- Use PASS / FAIL / PENDING / NOT RUN / N/A; explain skips. Every PASS needs its environment, tested SHA and evidence. Never reuse a stale green check. Add separate lint/typecheck/build rows only if individually run. -->

## 5. Pre-Merge Checklist

**Complete before merging:**
- [ ] **Requirements:** Match the verified Linear scope and success criteria; do not claim partial work completes a whole issue.
- [ ] **Code review:** Minimal, correct change; reused existing architecture; no unrelated files or Phase A business approval/eligibility blockers.
- [ ] **Review comments:** Recheck findings against current code; fix and verify valid issues, explain stale/incorrect ones; no unresolved blocking threads.
- [ ] **Tests & CI:** Focused tests and required checks pass on the exact head; include relevant security, DB and failure/retry tests.
- [ ] **Preview:** Verify the affected real workflow; test desktop and 390px mobile if UI changed. Mark N/A for docs-only changes.
- [ ] **Safety & approval:** Auth, RLS, secrets, data integrity and idempotency preserved; required GitHub approvals and branch rules satisfied.
- [ ] **Worktree:** Any new MDE worktree on the development host is under `/home/sk/mde-worktrees/`; no unrelated or uncommitted work lost.

**Merge decision:** NOT READY / READY — [Head SHA, evidence and any blocker.]

## 6. Post-Merge Verification & Recovery

<!-- Plan these before merging; execute and check the applicable steps only AFTER merge. -->
- [ ] **1. Verify merge:** Confirm merge SHA, intended files on `main` and merged-main CI.
- [ ] **2. Verify deployment:** Confirm Vercel production serves the merged SHA; deploy only if needed.
- [ ] **3. Verify Supabase/config:** Apply and verify only missing required migrations, Edge Functions or configuration. N/A if unchanged.
- [ ] **4. Test live result:** Exercise the affected user journey/API/agent and verify persistence, security, errors and 390px UI when relevant.
- [ ] **5. Fix failures:** Find root cause, apply the smallest safe fix through normal PR review, retest and redeploy or safely roll back.
- [ ] **6. Update GitHub & Linear:** Record SHA, tests, real URLs, screenshots, fixes and unresolved work; mark Done only after actual acceptance criteria pass.
- [ ] **7. Clean up:** Remove the merged task worktree/branch only after proving all work is preserved; never force-delete unrelated changes.

**By PR type:** Runtime/UI → live feature; DB/API → migration and durable transactions; AI → grounded output and authorized actions; Tests-only → regression/CI; Docs-only → published docs/template.

**Recovery plan:** [Rollback/revert or safe forward fix for runtime changes; N/A with reason otherwise.]

### Final Post-Merge Results

| Item | Result / evidence |
| --- | --- |
| Merge / production SHA | NOT VERIFIED |
| Main CI / deployment | NOT VERIFIED |
| Live functionality | NOT VERIFIED / N/A |
| Working URLs / screenshots | NOT VERIFIED / N/A |
| Errors & fixes | None / [Problem → fix → proof] |
| Linear task | NOT VERIFIED |
| Worktree cleanup | NOT VERIFIED |
| Final verdict | PENDING / PASS / PARTIAL / FAIL |

<!-- Agent safety: Use risk-matched checks, not unnecessary platform-wide tests. Production probes are read-only by default; inspect side effects and use isolated QA fixtures/verified cleanup for any approved writes. No fabricated results, screenshots, URLs or deployment claims. -->
