# GitHub PR quality standard

The PR stage is part of the same Linear task. Use this after implementation checkpoints pass and before the task can approach Done.

## PR readiness

Before commit/opening a PR:

1. Re-read the Linear goal, scope, and Definition of Done.
2. Inspect the exact diff and changed-file list.
3. Run the pre-commit gate in [pre-commit.md](pre-commit.md).
4. Confirm every changed path belongs to this task: inspect staged, unstaged and untracked paths, stage explicit task files, and preserve unrelated work.
5. Load the domain skills required by the changed paths.
6. Verify load-bearing external API assumptions with installed source/types and official sources.
7. Run the cheapest targeted proof for the actual change.
8. Run the risk-matched pre-merge matrix in [pre-merge-tests.md](pre-merge-tests.md).
9. Update Linear progress/evidence before commit.

## PR body

A reviewer should understand the change without having read the task. **Titles are real-world**: what changes for a person, not the internal mechanism.

Always include:

- user/business outcome
- faster/better implementation choice
- real user journey (or an explicit "no user-visible change")
- files changed and purpose
- source/reuse decisions, with a receipt for every external source that materially affected the solution — field list in `AGENTS.md` § Evidence rules
- exact tests and results
- reviewer fast path: 3–5 files to inspect first
- explicit non-goals
- post-merge checks

Add only when they apply — **never to satisfy a format**, because a docs-only PR needs no architecture diagram:

- architecture/data-flow Mermaid
- database proof: schema, RLS, or migration changes
- auth/tenant/RLS/HITL impact
- external contracts/versions verified

The body lives on **GitHub**, not in a local scratch file. Create it with `gh pr create --body-file` and re-run `gh pr edit` whenever the change moves — after review fixes, a scope change, or a flipped check. A body describing an earlier revision is worse than no body, because it reads as current.

A body that only restates the diff has added nothing.

## PR shape and exact-head rule

Keep each PR to one independently testable outcome, **not necessarily one code layer**. A small, complete user journey may span UI, server action and one canonical Supabase RPC; split only unrelated work or genuine risk/dependency boundaries. Link the exact verified Linear issue/title when one exists; never fabricate an issue to fill the template. Give reviewers the 3–5 highest-risk files (or fewer in a small PR).

After any pushed fix, treat earlier green checks as stale evidence. Record the new head SHA and require the relevant checks/reviews on that exact head (or GitHub test-merge commit when the repository reports checks there). If branch protection requires the branch to be current with `main`, update it and rerun checks before merge.

Do not treat a skipped workflow as proof that the covered behavior was tested; verify that every task-required check actually ran.

## Automated-review freshness

Before merge, record whether each required reviewer/check evaluated the current head:

| Reviewer/check | Required? | Reviewed/tested SHA | Current? | Blocking findings |
| -- | -- | -- | -- | -- |
| CodeRabbit | yes/no | `<SHA>` | yes/no | `<N>` |
| Qodo | yes/no | `<SHA>` | yes/no | `<N>` |
| CI | yes | `<SHA>` | yes/no | `<N>` |
| Preview | when applicable | `<SHA>` | yes/no | `<N>` |

A bot summary or approval on an older SHA is stale evidence after a push.

## PR troubleshooting rule

A review comment is a hypothesis, not authority. Follow the concrete re-check procedure in [`task-verifier/SKILL.md` § "Bot findings are hypotheses, not facts"](../../task-verifier/SKILL.md) — re-fetch the exact file(s) a bot names at the PR's current head before fixing or dismissing anything it reports; this file does not duplicate that procedure.

For every actionable comment:

```text
comment
→ classify
→ identify domain
→ load domain skill
→ inspect current code/version/live state
→ use MCP / official docs / official GitHub when needed
→ decide valid / invalid / stale / out-of-scope
→ smallest safe fix if valid
→ targeted verification
→ reply with evidence
→ resolve thread
```

Do not resolve because code was merely edited. Resolve only after proof is recorded.

## Merge approval and sole-collaborator exception

`main` requires one approving review. **Sole-collaborator exception:** while the repository has exactly one collaborator and that account is also the PR author, GitHub cannot record the required approval because self-approval is forbidden. In that specific case an administrator merge is allowed only when all of the following are true:

- the exact PR head has `floor` and `mastra-schema-init` green;
- the canonical MDE review (`review / verify-review-result`) is green on that head, with no verified blocking finding;
- every review thread is resolved (0 unresolved);
- the PR body records the exception, the exact head SHA, and the checks that passed.

Record each use in `docs/07-operations/merge-approval-history.md` and in the PR. The exception ends when a second collaborator with write access exists; the normal one-approval rule then applies with no bypass.

Only use the exception when the actual collaborator count and approval restrictions are verified for the exact repository and PR. GitHub branch protection and task-specific risk gates still apply.

## Completion gate

PR work is complete only when:

- all substantive comments are classified
- valid in-scope findings are fixed and verified
- invalid/stale/out-of-scope/noise findings are resolved with evidence or ownership
- exact-head CI is green
- no unresolved blocker thread remains
- post-merge checks are defined before merge

## Agent prompt

```text
Prepare or troubleshoot this PR as part of the same Linear task. Re-read the task goal/DoD, inspect the exact diff versus current base, run the pre-commit and pre-merge gates, and verify every changed file belongs to scope. Build a reviewer-friendly PR body with outcome, architecture/reuse decisions, security/tenant impact, exact verification, reviewer fast path, non-goals, and post-merge checks. Inventory every substantive review thread, classify each before editing, route uncertain claims through the owning skill/MCP/official source, apply the smallest verified fix, rerun targeted proof, reply with evidence, and resolve only after proof. Before acting on any bot-reported finding, follow task-verifier/SKILL.md's bot-recheck procedure: re-fetch the exact file at the current head and confirm the finding still holds. Do not merge until current-head required checks are green and no blocker remains.
```


## Updating an existing PR without losing its description

**Preservation is mandatory, including concurrent edits.** Fetch the current PR body, diff, head SHA and update timestamp before editing. Retain its substantive explanation, acceptance criteria, evidence, reviewer discussion, bot-authored summaries and useful history. Edit only stale or missing sections; never replace the entire body with a fresh template. If older claims are no longer true, label them `Superseded` and link current proof rather than silently erasing them. **Immediately before saving, re-fetch the PR body and update timestamp** and compare with the snapshot used for editing; if another contributor or bot updated it, incorporate their changes and rebuild the patch rather than overwriting them. Serialize same-PR edits when agents collaborate; GitHub's PR-body edit is not an atomic compare-and-swap. Re-fetch after saving to verify important original material and intervening edits survived. If a conflict cannot be safely reconciled, do not save a stale body.

**Plain-English title:** Name the real outcome for a user (e.g. "Rentals: Show Viewing Requested Only After Saving"), not just an internal test ID or library refactor. Use the verified exact Linear title in the PR body; never invent an issue association. Distinguish **product/runtime**, **test-only**, **documentation-only**, and **infrastructure** work explicitly. For test-only work, say what failures the tests catch and confirm they do not ship a user-facing feature.

**Good description order:** Existing explanation retained → one outcome and real-world example → reuse and changed stack → files/reviewer fast path → journey/Mermaid only if complex → task-specific success criteria → **one** verification table with separate results per check and run environment/SHA → merge decision → post-merge/recovery → material official references. Keep a single authoritative section for each subject; don't append a duplicated template below an existing complete description. Delete irrelevant new-PR prompts and use `N/A — reason` where that informs reviewers.

**No fake PASS:** Record `PASS`, `FAIL`, `NOT RUN` or `N/A` separately for each focused command, `floor`, `mastra-schema-init`, and the canonical `review / verify-review-result` check. For **every PASS**, record run environment, exact source SHA and link to output (local evidence or CI). Use the risk-matched pre-merge matrix rather than running every expensive browser/database test on every PR. Existing MDE Floor, PR Agent, Playwright and deployment-freshness workflows own automation; do not add duplicate CI. For changed UI include preview URL and desktop/390px screenshot proof when safe and relevant. Docs-only PRs need structural/template rendering checks rather than invented runtime user journeys; test-only PRs should prove which regression their tests catch. Do not promise production verification before merge.

**Official reference pointers:** [GitHub PR templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository) for the template location; [GitHub Mermaid](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams) for renderable journeys; [Playwright tests](https://playwright.dev/docs/running-tests) for browser commands; [Vercel environments](https://vercel.com/docs/deployments/environments) for preview, production and commit verification. Add component-specific docs when relevant; links are not test evidence.

## Post-merge safety and recovery

**Match verification to PR type.** Documentation changes verify committed files and, if relevant, a new-PR editor template after merge. Test-only changes verify the test/CI contract. Runtime changes verify the deployed commit, selected safe user journey, and rollback/forward-fix plan.

**Production test side effects:** Do not describe `npm run verify:production` as a read-only smoke: `scripts/verify-production-release.mjs` can launch `e2e/prod-release-health.spec.ts` and persist a real host-agent thread. Inspect scripts at the tested commit before running any production probe. Run production-writing probes only with explicit task-specific opt-in, isolated QA fixtures and confirmed cleanup; default to read-only HTTP/deployment/version checks. This is a technical safeguard, not a business approval/eligibility gate.

**Rollback/recovery:** Describe how to revert, roll forward safely, or repair a database migration without losing legitimate data. Do not confuse a Vercel READY status with a proven working user journey.

**Advisory description quality:** Agents should flag missing user outcome, changed files, reviewer fast path, exact-head evidence, misleading `PASS`, unresolved placeholders or duplicate sections before marking a PR review-ready. This is guidance using the existing review workflow, not a new mandatory status check. Any future automated PR-body linter should be additive, advisory, and separately reviewed under the repository's GitHub Actions change policy.
