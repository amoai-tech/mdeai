<!--
MDE AI — one clear, testable outcome per PR. Remove unused prompts; explain N/A.
Before merge, leave post-merge boxes unchecked. After merge, record actual results in the PR body.
Follow AGENTS.md and .claude/skills/tasks/references/github-pr.md; preserve existing PR body edits.
-->

## 1. Purpose

**Purpose:** [What problem does this PR solve, and why is it needed?]

**Expected outcome:** [What will work better for users?]

**Real-world example:** [Who uses it, what they do, and what happens. Include saved data if relevant.]

**Linear task:** [Link the verified task, using its exact title and SPEC-ID if applicable.]
<!-- Use `Closes SAN-#### · SPEC-ID — Exact verified title` for completed scope; `Part of SAN-#### · SPEC-ID — Exact verified title` for partial work. Use N/A if no task exists. -->

**Type / Tech stack:** [App feature / Bug fix / Tests / Docs / Infrastructure] · [Technologies changed]

## 2. Changes & Improvements

**Implemented**
- [Main change]
- [Second change, if needed]
- [Third change, if needed]

**What we reused:** [Existing component, service or tool. Why is this the simplest fix?]

**Files to review:** [Up to 5 key files and what to check.]

**How to try it:** [Exact steps, preview URL or test command.]

**Risks / limitations:** [What could fail, what is untested, or N/A.]

**Non-goals:** [What this PR deliberately does not change.]

## 3. User Journey & Architecture

**User journey:** N/A — unchanged.

**Architecture:** N/A — unchanged.

<!-- Agent instructions:
For meaningful user journey or architecture changes, replace N/A with the actual flow and embed real Mermaid code blocks directly in the PR description. Use one diagram if it explains both; add a second if needed. Include important failure/retry paths. Verify the routes, components and data sources. Diagrams explain the design; tests prove it works.
Examples (uncomment ONLY after replacing all example nodes with verified paths):
~~~mermaid
flowchart LR
    A["User action"] ==> B["Real UI or tool"]
    B ==> C["Verified visible result"]
~~~

~~~mermaid
flowchart LR
    UI["Existing UI or agent"] ==> API["Canonical server action or tool"]
    API ==> DB["Real source of truth"]
~~~
-->

## 4. Best Reference URLs

<!-- Read and verify up to 5 useful official docs, GitHub examples or version-matched sources. Explain how each helps finish the task. No receipt table needed. Use N/A if existing code and tests are enough. Links are not test evidence. -->

| Official reference URL | What matters | How to apply it to this PR |
| --- | --- | --- |
| [Exact official docs / GitHub example URL] | [Important feature or instruction] | [What to change or test] |

## 5. Success Criteria

<!-- Write 1–4 specific outcomes for this task. Tick only when proven. -->
- [ ] [The feature or fix works as expected.]
- [ ] [Results are correct and saved when needed.]
- [ ] [Errors, retries and access rules work correctly when relevant.]
- [ ] [The full user workflow works when relevant.]

## 6. Tests & Evidence

**Tested commit:** [Latest PR commit SHA]

| Check | Result | Proof: command, environment, commit SHA and link |
| --- | --- | --- |
| Focused tests | NOT RUN | [Command, results and link] |
| GitHub CI: `floor` | PENDING | [Run link and exact head SHA] |
| GitHub CI: `mastra-schema-init` | PENDING | [Run link and exact head SHA] |
| GitHub CI: `review / verify-review-result` | PENDING | [Run link and exact head SHA] |
| Playwright / browser, if relevant | N/A | [Preview URL, screenshot/test, or reason] |
| Supabase / API / integrations, if relevant | N/A | [Query, test, or reason] |

**Not yet verified:** [What still needs testing, or None.]

<!-- Use PASS / FAIL / PENDING / NOT RUN / N/A and explain skipped checks. For each PASS record the environment, exact tested SHA and evidence. Old green checks do not prove the latest commit. Add separate rows for each command run, including lint/typecheck/build. -->

## 7. Pre-Merge Checklist

**Complete before merging:**
- [ ] **Requirements:** Meet the agreed task and success criteria. Do not mark partial work complete.
- [ ] **Code review:** Keep changes small and correct. Reuse existing code; no unrelated changes or Phase A business approval/eligibility blockers.
- [ ] **Review comments:** Check each finding against current code. Fix and test real issues; explain incorrect ones. Resolve threads after proof.
- [ ] **Tests & CI:** Focused tests and required GitHub checks pass on the latest PR commit (or its GitHub-tested merge commit). Check security, data and retries when affected.
- [ ] **Preview:** Try the changed feature. For UI changes, test desktop and 390px mobile. Use N/A for docs-only work.
- [ ] **Safety & approval:** Protect login, data access (RLS), secrets and saved data. Retries must not create duplicates. Meet required GitHub approvals and branch rules.
- [ ] **Worktree:** Create new MDE worktrees on the development host under `/home/sk/mde-worktrees/`. Preserve other work and uncommitted changes.

**Merge decision:** NOT READY / READY — [Tested commit, proof and anything blocking merge.]

## 8. Post-Merge Verification & Recovery

<!-- Plan these before merging; execute and check the applicable steps only AFTER merge. -->
- [ ] **1. Verify merge:** Check the merged commit, changed files on `main`, and GitHub checks.
- [ ] **2. Verify deployment:** For app changes, confirm Vercel runs the merged commit. Deploy only if needed.
- [ ] **3. Verify Supabase:** Check database migrations, Edge Functions and settings. Apply only missing required changes through the approved workflow. Destructive or irreversible production data changes need explicit opt-in and a recovery plan. N/A if unchanged.
- [ ] **4. Test live result:** Try the affected feature, API or agent. Check saved results, permissions, errors and 390px mobile when relevant. **Read-only by default.** Tests that write data need task-specific opt-in, isolated QA data and verified cleanup. `npm run verify:production` can save a real chat thread; it is not read-only.
- [ ] **5. Fix failures:** Find the cause, make a small safe fix through PR review, retest and redeploy, or roll back safely.
- [ ] **6. Update GitHub & Linear:** Record the commit, tests, working links, screenshots, fixes and remaining work. Mark Done only when success criteria pass.
- [ ] **7. Clean up:** Remove the merged branch/worktree only when all work is safely preserved. Never force-delete unrelated changes.

**What to test:** App/UI → live feature; Database/API → saved data and migrations; AI → accurate answers and authorized actions; Tests-only → regression tests and CI; Docs-only → updated docs/template.

**Recovery plan:** [How to undo or safely fix a failed deployment. N/A with reason if no app change.]

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
