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

Keep the PR to one reviewable outcome. Split unrelated schema, infra, or second-task work before opening the PR. The body must link the exact Linear task and give reviewers a fast path to the 3–5 highest-risk files.

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

**Preservation is mandatory.** Fetch the current PR body and diff before editing. Retain its existing explanation, acceptance criteria, evidence, reviewer discussion, and useful history. Make minimal corrections in place where required for accuracy, then **append missing sections** from \`.github/pull_request_template.md\` rather than replacing the body with a fresh template. If older claims are no longer true, label them \`Superseded\` and link current evidence; do not silently erase them. After an update, compare old/new bodies to confirm the original substantive narrative remains.

**Plain-English title:** Name the real outcome for a user (e.g. "Rentals: Show Viewing Requested Only After Saving"), not just an internal test ID or library refactor. Use the verified exact Linear title in the PR body; never invent an issue association. Distinguish **product/runtime**, **test-only**, **documentation-only**, and **infrastructure** work explicitly. For test-only work, say what failures the tests catch and confirm they do not ship a user-facing feature.

**Good description order:** Existing description preserved → short user-facing outcome → real-world example/features → changed tech stack → reuse/need rationale → relevant files → user journey/diagram if complex → measurable success criteria → exact pre-merge commands/results → merge checks → post-merge/live steps → material official references with actionable usage. The new PR template includes these fields; delete irrelevant prompts in new PRs, and use \`N/A — reason\` on older ones.

**No fake PASS:** Document \`PASS\`, \`FAIL\`, \`NOT RUN\`, or \`N/A\` per command, with run environment and relevant SHA. Do not promise production verification on a PR that has not merged. A docs-only PR is validated by template Markdown and new-PR editor inspection, not by pretending to run user journeys; it has no separate runtime rollout.

**Official reference pointers:** [GitHub PR templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository) for the template location; [GitHub Mermaid](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams) for renderable journeys; [Playwright tests](https://playwright.dev/docs/running-tests) for browser commands; [Vercel environments](https://vercel.com/docs/deployments/environments) for preview, production and commit verification. Add component-specific docs when relevant; links are not test evidence.
