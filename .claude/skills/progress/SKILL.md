---
name: progress
description: Use when tracking what is complete, in progress, blocked, not started, or still needs evidence; produces an evidence-based status of tasks or project work without inventing completion percentages.
---

**PROGRESS — Evidence-Based Status**

**Goal**
Show what is complete, in progress, blocked, not started, or unproven using current evidence.

**1. Verify current truth**
Use relevant:
- Linear
- current main/PRs
- runtime/production
- Supabase/provider state
Do not infer completion from status labels alone.

**2. Classify each item**
- 🟢 Complete — delivered and verified
- 🟡 In progress — partially implemented
- 🔴 Blocked — cannot proceed safely
- 🔵 Not started — no verified implementation
- ❓ Needs evidence — status cannot be proven

**3. Report proof**
For each item state:

**task/outcome → status → evidence → blocker/gap → next action**
Use full Linear names:

**SAN-#### · Exact Linear Task Name**

**4. Avoid fake percentages**
Use percentages only when there is a real denominator and objective measurement.
Prefer status + evidence.

**5. Prioritize next work**
Order:

**launch blocker → dependency → user journey → reliability/security → polish**

**Output**
| Task / Outcome | Status | Evidence | Gap / Blocker | Next Action |
|---|---|---|---|---|

**Always use the fastest safe tracker-update workflow**

Pair this skill with `.claude/skills/efficient/SKILL.md` on every progress-tracker refresh:

1. **Preserve the original roster and order.** Record the existing task identifiers before editing, and confirm the same unique identifiers/count after saving. Never silently add, delete, reorder or replace issues.
2. **Audit deltas, not the whole codebase.** Cheaply confirm the live status/title of every roster issue, then deeply verify only issues changed since the prior snapshot, dependent issues, new PRs, and open proof exceptions. Compare recorded main/production SHAs, not dates alone.
3. **Separate status from correctness.** Status and the workflow-stage percentage come from Linear. Acceptance percentage is `passed verified criteria / total applicable criteria` only if the denominator and results are recorded; otherwise show `— / not measured`. A Linear Done without runtime proof may remain yellow/needs evidence.
4. **Make one targeted update per changed issue.** Reuse canonical implementation and existing tests; start with a focused test. Run affected API/DB/RLS and browser proof only when relevant, and the full floor once on a final code candidate. Do not create new trackers, agents, issues, approval gates, or duplicate test suites.
5. **Update the existing table in place.** Preserve task title, linked PR, status, stage %, acceptance proof, missing/failing item, and one next action. Store the evidence SHA, current deployed SHA if needed, tests, SQL readback for writes, date, failure/retry and cleanup. If an editor only returns a truncated body, use minimal safe patches and verify the row count; never replace an unread document wholesale.
6. **State the next highest-value unblocker.** Work on real Phase A user-journey defects now; postpone public-launch business certification until the owner starts Phase B. Keep core authorization, user isolation, integrity, idempotency and audit safeguards.

Example: a merged Rentals-filter PR changes only the affected filter row and its dependencies after fresh proof. It does not trigger a re-audit of unrelated Stripe or Events tasks.

**Rules**
- Evidence over optimism.
- No generic technology inventory.
- No fake % complete.
- Do not call Done without proof.
- Keep the tracker concise.
