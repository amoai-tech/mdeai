# Implementation plan: [verified Linear task title]

**Linear:** [SAN-#### · exact title](https://linear.app/amo100/issue/SAN-####)
**Intent:** [matching intent.md] · **Spec:** [matching spec.md]
**Base:** [main or PR merge base SHA] · **Worktree/branch:** [where changes happen]
**Status:** Draft (document only; feature status is in Linear)
**Graphify:** [required for broad code; or N/A — narrow known docs]

## Decision: fastest safe reuse

[Existing source-of-truth owner] → [smallest code change]. State what is reused and what is explicitly not being rebuilt.

## Dependencies / risk

- Blocking task/contract: [verified issue or None]
- Relevant technical safeguards: [auth/RLS/atomic writes/retries, only if affected]
- STOP when: [unsafe action, broken assumption, unverified schema, wrong base, etc.]

## Ordered checkpoints

### 1. Verify the current path
- [ ] Inspect exact owner files, main/PR, live Linear issue and baseline.
- **Proof:** [command/output]. **STOP:** [invalid assumption].

### 2. Make the minimum change
- [ ] Modify [exact file/owner]; preserve existing contracts and unrelated files.
- **Proof:** [focused test]. **STOP:** [failed focused test].

### 3. Verify real behavior
- [ ] Run [focused test → relevant integration/role check → lint/typecheck → UI/browser as warranted].
- **Proof:** [observable UI/API/DB; screenshot or redacted evidence if needed]. **STOP:** [any incorrect/unauthorized/duplicate result].

### 4. Deliver and hand off
- [ ] Inspect exact diff, run applicable repo gates, commit, push and open/update one PR.
- [ ] Triage current-head review comments, fix validated findings, rerun proof; update existing Linear issue with status, blockers and precise next action.
- **Proof:** [SHA, PR, CI, checks, Linear update]. **STOP:** do not claim merge/deploy without evidence.

## Actual evidence (append only after execution)

| Checkpoint | Command / environment | Result (PASS / FAIL / UNVERIFIED) | Evidence / SHA |
| --- | --- | --- | --- |
| Baseline | | UNVERIFIED | |
| Focused regression | | UNVERIFIED | |
| End-to-end | | UNVERIFIED | |
| Exact-head review | | UNVERIFIED | |

**Post-merge (only after merge):** verify merged `main`, affected journey, exact release if deployed, then update Linear. Do not force launch certification gates during Phase A.
