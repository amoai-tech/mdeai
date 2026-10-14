# Merge approval history

Decision record for administrator overrides of the `main` approval requirement. `AGENTS.md` states
the operating rule; this file keeps the evidence for past exceptions so the rule itself does not
accumulate incident history.

Current rule: `main` requires one approving review. An administrator bypass is exceptional and must
be recorded in the affected PR — the reason, which required automated checks passed, and why waiting
for normal approval was not appropriate. See `AGENTS.md` § CI and merge approval.

## 2026-09-28 — PR #140 and PR #143

**Merged with an administrator override.**

**Why:** they were the upper layers of a stacked sequence, so the layer below blocked review of
everything above it. Every automated check that could run (`floor`, `deterministic chromium`,
`review`, `Vercel`) was already green, and neither PR touched runtime application code — they changed
skills, CI checks, and documentation.

**What the reviewer would have been asked to check:** whether the skill and gate changes were worth
landing at all, and whether the deferred finding in #140 should block the merge — eval packs with no
`expectations`, tracked as **SAN-1365**.

**Open question:** the second of those was never answered. The review thread was left unresolved
rather than closed, and SAN-1365 remains open.

**Not a precedent.** A production PR — anything changing application behaviour, a database, or a
deploy — satisfies the approval requirement normally. A bypass is defensible only for a non-runtime
change whose reason is written down here.

## 2026-09-29 — PR #150

**Merged with an administrator override.**

**Why:** the repository has exactly one collaborator — `amoai-tech` — which was also the PR author.
GitHub does not permit self-approval, so the required approval was not obtainable from any account.
The only alternatives were to leave a docs-only change unmergeable indefinitely, or to lower the
branch protection — which is worse, because it would remove the control for runtime PRs as well.
`floor`, `deterministic chromium`, `review`, `mastra-schema-init`, `Vercel`, Codacy and Kilo Code
Review were all green on the exact merged head `a6603616d`, and conversation resolution was satisfied
with 0 unresolved threads.

**What the reviewer would have been asked to check:** whether `mvp.md` states the right launch gates
and the right rental critical path (Build → Prove → Certify), and whether the three review rounds'
dispositions were correct — specifically the removal of volatile production status and the addition
of host payout to the Events gates.

**Nothing unreviewed rode along:** `mvp.md` was diffed against the reviewed head before merge and was
byte-identical, so the merged tree contains exactly what was reviewed. Merge commit `e1e33d4d7`.

**Open question — structural, not procedural:** a protected branch with a one-member review
requirement can never be satisfied, so every future PR faces the same choice. This should be fixed
deliberately — invite a second reviewer, or scope the review requirement so it excludes docs-only
paths — rather than worked around repeatedly.

**Not a precedent.** A production PR — anything changing application behaviour, a database, or a
deploy — satisfies the approval requirement normally. A bypass is defensible only for a non-runtime
change whose reason is written down here.

## 2026-09-29 — PR #155

**Merged with an administrator override.**

**Why:** the same structural blocker as PR #150. The repository has exactly one collaborator —
`amoai-tech` — which was also the PR author, so GitHub did not permit the required approval from any
account. `floor` (4m28s), `deterministic chromium`, `deterministic Maps contracts`,
`mastra-schema-init`, `supabase-acl`, `review / review`, `review / verify-review-result`,
`Kilo Code Review` and `Vercel` were all green on the exact merged head `1b6580d2a`. The only failing
check was `Codacy Static Code Analysis` (6 findings, all one false-positive class), which does not
gate a merge on this repository.

**What the reviewer would have been asked to check:** whether `floor` is the right owner for the
CopilotKit architecture contract, whether the deliberate alias indirection is preferable to inlining
the command, and whether running the guard at step 4 rather than later in the chain is the correct
fail-fast position.

**Nothing unreviewed rode along:** the merged tree was diffed against the reviewed head and is
byte-identical. Two files, `+157/-2`: `package.json` and
`scripts/__tests__/copilotkit-v2-guard.test.mjs`. Merge commit `88cc3c3e9`.

**Two review bots did not actually review this head, and their green status should not be read as
coverage.** CodeRabbit reported `pass` while its own comment says "Review limit reached"; Sourcery
reported `skipping` because the 250,000-character weekly diff budget was exhausted.

**Codacy disposition — 6 findings, all verified false positives.** Every finding was the same rule,
"The application dynamically constructs file or path information", on the new test's temp-root fixture
lines. No request, environment, CLI, or network input reaches those paths, so the heuristic's premise
does not hold for a hermetic test harness. This is a different class from the one catalogued in
`.claude/skills/code-review/references/ci-review.md`, which covers only the prose-absolute heuristic.
It is a candidate for that catalogue rather than a code change.

**Not a precedent — and now the second consecutive override.** PR #150 and PR #155 were both bypassed
for the same one-collaborator reason, which is the repetition this file's own open question from #150
warned against: *"a protected branch with a one-member review requirement can never be satisfied …
This should be fixed deliberately — invite a second reviewer, or scope the review requirement so it
excludes docs-only paths — rather than worked around repeatedly."* Two overrides in two merges is that
pattern. The structural fix remains open and is the reason a third entry should not be needed.

## 2026-10-14 — PR #310 (retrospective merge-approval audit)

**What GitHub proves:** [PR #310](https://github.com/amoai-tech/mdeai/pull/310)
merged at **2026-10-14 16:32:06 UTC** by `amoai-tech`, merge commit
`369803dc06462ee8ed0f1c808927ac56d1e33ecb`. The GitHub
`/pulls/310/reviews` API returns **zero submitted reviews**, not one approval.
The account `amoai-tech` has repository **admin** permission.

**Why an admin-exempt merge was possible:** the current classic `main`
protection requests **one approving review**, requires **`floor`** and
**`mastra-schema-init`**, and has **`enforce_admins=false`**.
The collaborator API lists **only `amoai-tech`** (also the PR author and
merger). Under GitHub's documented classic-branch-protection rules, admin
restrictions do not apply unless admin enforcement is enabled. This merge
therefore meets the observable conditions for the administrator exemption;
it **does not** meet the normal independent-review requirement.

**Required-check evidence:** on PR head
`bf16cd7437cc18256c75e28b92297f05439c39ab`, GitHub Actions
`floor` and `mastra-schema-init` were **success**, as was advisory
`deterministic chromium`. The merge's exact release was subsequently
certified on Vercel and six timezone × mobile/desktop browser scenarios
passed on production.

**Operator's contemporaneous reason:** **NOT RECORDED / UNVERIFIED.**
The one-collaborator limitation explains why a normal independent review
was impossible; it does **not** establish why the operator chose to merge
this runtime UI change without the required review. The GitHub timeline
does not include the rationale. The organization's audit-log endpoint was
not accessible to this verification account (HTTP 404). Do not
retroactively claim an approval, an emergency, or a policy waiver.

**Exception to existing project policy:** unlike the prior documentation
or test-only precedents, #310 modified event runtime formatting and a
browse card. The earlier policy explicitly says runtime changes need
normal independent approval. This is an **unresolved process deviation**,
not a precedent authorizing future runtime bypasses.

**What an independent reviewer should check:** deterministic
server/browser timezone handling, no change to stored UTC timestamps,
no lost checkout behavior, six-configuration real-browser proof, and
whether any scheduled event type legitimately uses a different timezone.
[Production evidence](https://github.com/amoai-tech/mdeai/pull/310#issuecomment-6173465239).

**Required closure:** repository owner supplies and signs the actual
merge rationale, records an independent retrospective review if an
eligible reviewer is available, and resolves the structural one-reviewer
deadlock rather than routinely exempting administrators. Keep
[SAN-1486 · MDE Events — Show Correct Medellín Event Times Without Hydration Errors](https://linear.app/amo100/issue/SAN-1486/mde-events-show-correct-medellin-event-times-without-hydration-errors)
flagged for governance signoff; the production timezone outcome itself
is verified.

**Official rule:** https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches

## Adding an entry

Record: the PRs, the date, the reason, which required checks had passed, what a reviewer would have
been asked, and any question left open. If an override becomes a habit, the rule is wrong and should
be changed deliberately — not worked around quietly.
