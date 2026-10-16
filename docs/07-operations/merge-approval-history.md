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

## 2026-10-16 — PR #356, PR #345 and PR #357

**Merged with an administrator override.** This entry was written afterwards from GitHub's own record,
at the owner's request. The owner has not yet stated why the normal approval was bypassed.

| PR | Merged (UTC) | Merged head | Merge commit | `floor` | Human review |
| -- | -- | -- | -- | -- | -- |
| #356 — Prevent Fake Publisher Names and Dates on Rental Listings | 17:28:37 | `fe07bd0ec` | `06aae32de` | success | none |
| #345 — Restaurant detail pages with a working, cross-device vote | 17:45:07 | `110d7f1f7` | `c87c0a184` | success | two comments, no approval |
| #357 — Events found by AI search show on the map with the right currency | 18:06:51 | `7735f95f4` | `886716ee3` | success | one comment, no approval |

Both were merged by `amoai-tech`, and GitHub still showed the review decision as `REVIEW_REQUIRED`.
For #356 every automated check on the merged head had passed (`floor`, `supabase-acl`,
`deterministic chromium`, `mastra-schema-init`, `review`, Codacy). For #357 the same set that applies to it
(`floor`, `deterministic chromium`, `mastra-schema-init`, `review`, Codacy) had passed on the merged head.
The other checks on #345's final head were not re-read for this entry.

**What each one changed:** #356 adds a database migration (`20261016234000`) so the server, not the
caller, records who published a listing and when. #345 changes runtime application code for the
restaurant vote screen and adds the file for a database change (`20261016230000_vote_my_receipt`) that
production had already applied. #357 changes one application file (and its test) so AI event search results
are completed with city, coordinates, currency and map link; it has no database change.

**Why:** *Owner to confirm.* The 2026-09-29 entry records that the repository has one collaborator,
which is also the PR author, so GitHub does not allow the required approval to come from another
account. Whether that is the reason here is for the owner to write.

**What a reviewer would have been asked to check:** for #356, whether an ordinary signed-in user can
still forge the publisher or the publication time through any path, and whether development publishing
stays open. For #345, whether the vote can be cast twice or by the wrong person, and whether the
receipt persists across devices. For #357, whether a failed lookup keeps the original results and whether
a map pin is ever invented for an event without coordinates.

**Open question:** no database change from these PRs has been applied to production by the merges. The
first production push still needs the owner's go-ahead and an exact dry-run manifest, so an independent
read of #356's migration can still happen before it reaches the database. Whether that read will happen is
undecided. #345 and #357 are application code on `main`, so the normal release may already have deployed
them; that was not checked for this entry.

**Not a precedent.** By the rule at the top of this file, both PRs changed runtime behaviour or a
database, so they should have satisfied the approval requirement normally. The reason above must be
written before this entry is treated as complete.

## Adding an entry

Record: the PRs, the date, the reason, which required checks had passed, what a reviewer would have
been asked, and any question left open. If an override becomes a habit, the rule is wrong and should
be changed deliberately — not worked around quietly.
