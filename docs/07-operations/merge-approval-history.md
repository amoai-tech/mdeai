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

**Not a precedent — the structural blocker remained unresolved.** PR #150 and PR #155 were both
merged without a recorded approving review, as the one-collaborator warning in the #150 entry
anticipated. Subsequent PRs #310 and #312 also merged with **zero submitted approving reviews**.
The earlier expectation that a third exception would not be needed was not met. These later
runtime changes have **no verified contemporaneous rationale** in their PR records; do not
treat the documented reasons for #150/#155 as if they also justified #310/#312. The open fix
is an eligible independent reviewer and enforceable future review, not another assumed waiver.

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
merger). GitHub's classic-branch-protection rules ordinarily exempt admins
unless administrator enforcement is enabled. These settings were checked
**after the merge**; they explain how an administrator-exempt merge was
possible but do not independently prove the precise historical bypass
event or what settings existed when the merge occurred. Regardless, there
was **no independent approving review**.

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

**Required closure (pending, not a retroactive approval):**

- [ ] The merging administrator adds a dated comment to PR #310 stating
  their **actual reason** for proceeding without normal review and why
  waiting was not appropriate. If that reason cannot be reconstructed,
  record it as unknown instead of guessing. Link the comment here.
- [ ] An eligible, independent reviewer with write access examines the
  exact merged diff and the production test evidence. Record their
  **retrospective** findings and date; never present that review as if it
  preceded the merge.
- [ ] Resolve the single-collaborator deadlock for future production
  changes by adding a legitimate reviewer and enforcing the intended
  branch rule. Any policy adjustment requires explicit owner approval.
- [ ] Reconcile this ledger and [SAN-1486 · MDE Events — Show Correct Medellín Event Times Without Hydration Errors](https://linear.app/amo100/issue/SAN-1486/mde-events-show-correct-medellin-event-times-without-hydration-errors)
  after the above evidence is recorded. The timezone outcome itself is
  already proven on production; only governance signoff remains.

**Official rule:** https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches

## 2026-10-14 — PR #312 (retrospective merge-approval audit)

**Verified merge:** [PR #312](https://github.com/amoai-tech/mdeai/pull/312) was merged
by `amoai-tech` at **2026-10-14 19:35:10 UTC**, merge commit
`42f50d3bb9a1dc146fe3d43f14047896215bbc6d` from head
`d6c56a8793dac980eec7bdf95528c0f6d7292490`.
The GitHub pull-request reviews API returned **zero submitted reviews**.
The PR changed Mastra runtime workspace registration and tests, not just documentation.

**Why the requirement might have been bypassed:** at the time of this retrospective
check, the `main` classic branch rule required one approval and
`enforce_admins=false`, and `amoai-tech` was the only listed collaborator
and had admin access. These **later-observed settings** explain how an
administrator-exempt merge was *possible*. They do not establish which
historical exemption was used or what the settings were at merge time.

**Required checks and production behavior:** on the source PR head,
`floor`, `mastra-schema-init`, and deterministic Chromium completed successfully.
The exact merged commit was deployed to Vercel production as
`dpl_8qTQXK4feFUBQDQwJvHHGxcrUgxd`; the public alias and SSR HTML
identified that release. The post-merge checks reported **4/4 real Concierge
vertical searches** and **2/2 desktop/mobile chat-page tests**, with no new
`ENOENT: mkdir '/vercel'` workspace error during the inspected production
traffic. These are runtime proofs, **not evidence of prior independent approval**.
[Production verification receipt](https://github.com/amoai-tech/mdeai/pull/312#issuecomment-6176924302).

**Operator's contemporaneous reason:** **NOT RECORDED / UNVERIFIED**.
The single-collaborator constraint is not proof of the decision to merge.
Do not borrow the stated rationale from #150/#155, assert an emergency,
or invent a retroactive approval. This is a **separate unresolved runtime
governance deviation** from #310.

**Required closure (pending):**

- [ ] The merging administrator adds a truthful, dated explanation to
  PR #312 of why normal approval was not obtained, or explicitly records
  that the reason cannot be reconstructed; link the comment here.
- [ ] A separate eligible reviewer examines the exact merged runtime
  diff and production proof. Record dated findings as **retrospective**,
  not as approval obtained before merge.
- [ ] Resolve the one-collaborator deadlock for future runtime PRs and
  verify the intended review requirement is enforced. This requires
  explicit repository-owner approval for any protection-setting change.
- [ ] Reconcile this entry and
  [SAN-1487 · MDE Concierge — Fix Mastra Workspace Filesystem Errors on Vercel](https://linear.app/amo100/issue/SAN-1487/mde-concierge-fix-mastra-workspace-filesystem-errors-on-vercel)
  after governance evidence is supplied. The *targeted production
  filesystem fix* is already verified separately.

**Review-policy reference:**
https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews

## Adding an entry

Record: the PRs, the date, the reason, which required checks had passed, what a reviewer would have
been asked, and any question left open. If an override becomes a habit, the rule is wrong and should
be changed deliberately — not worked around quietly.
