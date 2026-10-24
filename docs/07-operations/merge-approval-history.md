# Merge approval history

Decision record for administrator overrides of the `main` approval requirement. `AGENTS.md` states
the operating rule; this file keeps the evidence for past exceptions so the rule itself does not
accumulate incident history.

Current rule: `main` requires one approving review. **Sole-collaborator exception:** while the repository has exactly one collaborator and that account is also the PR author, GitHub cannot record the required approval because self-approval is forbidden. In that exact case an administrator merge is allowed only when the exact PR head has `floor` and `mastra-schema-init` green, the canonical MDE review (`review / verify-review-result`) is green on that head with no verified blocking finding, every review thread is resolved, and the PR body records the exception and exact head SHA. Each use is recorded below and in the PR. The exception ends when a second collaborator with write access exists.

## 2026-10-20 — PR #472 · El Cielo Details labels (sole-collaborator exception)

The owner requested completion of [PR #472](https://github.com/amoai-tech/mdeai/pull/472), which reuses the existing display-label helper from #465 in restaurant Details lookup; no database changes or booking/vote permission changes. Current GitHub collaborator query showed exactly one repository collaborator, `amoai-tech`, who also authored the PR. The normal approving-review rule is structurally unsatisfiable because GitHub disallows self-approval.

The documented administrator exception is permitted **only on the exact final head** after `floor`, `mastra-schema-init`, and canonical `review / verify-review-result` all pass and unresolved review threads are zero. Record the final head SHA, evidence, and merge result in the PR discussion before and after merging. This entry does not grant a general bypass or weaken any check. The actual post-merge production outcome must be verified separately (the custom domain was still on the earlier #462 build when reviewed).

**Review question:** Do both real El Cielo venue IDs preserve their canonical Supabase names, ratings and map/vote references while browse and Details use identical location-qualified labels? Local focused Vitest 28/28, ESLint and typecheck passed prior to this documentation addition; exact-final-head CI is the merge criterion.

## 2026-10-20 — PR #460 · Home map failure and search polish

**Sole-collaborator exception — validate exact final head before merge.** GitHub's authenticated collaborator list was independently checked during the October 20 release: the repository has exactly one collaborator (`amoai-tech`), who also authored [PR #460](https://github.com/amoai-tech/mdeai/pull/460). GitHub prohibits self-approval. As defined in `AGENTS.md`, an administrator may merge only if the *exact final head* has green `floor`, `mastra-schema-init` and canonical `review / verify-review-result`, plus **zero unresolved review threads**. Record the final SHA and checks in the PR before merging; branch protection stays unchanged. Run the existing deterministic Chromium/Maps checks too.

**Independent pre-merge failure reproduction:** On 2026-10-20, blocking `maps.googleapis.com/maps/api/js` in headless Chrome on the production `www.mdeai.co` homepage at 390px and 1440px returned HTTP 200 but **no map error notice**, and the form had no focus-ring class. At 1440px its headline started at x=80 while the other page sections used a different inset. #460 adds the single canonical `MapsShell` script-load error state, repairs focus ring/placeholder, and unifies hero alignment. No database/mapping subsystem/approval gates are added.

**Post-merge acceptance:** The certified new deployment must reach `www.mdeai.co`, then rerun blocked-Maps test: notice visible, search remains interactive, no horizontal overflow or console errors, 390/1440px hero alignment and focus ring correct. CI green alone is not production proof.

## 2026-10-20 — sole-collaborator policy (current rule)

**This is a deliberate rule change, not another one-off bypass.** It supersedes the “not a precedent” language in the entries below for the sole-collaborator case only.

The repository still has exactly one collaborator (`amoai-tech`), which is also the author of every PR. GitHub forbids self-approval, so the one-approval requirement was structurally unsatisfiable: PR #140, #143, #150, and #155 were merged only through overrides, and the open question from the #150 entry — invite a second reviewer or scope the rule — was never resolved. Runtime PRs such as #369 then became unmergeable even with every check green.

**The rule now:** while the repository has exactly one collaborator, an administrator merge is allowed only when:

- the exact PR head has `floor` and `mastra-schema-init` green;
- the canonical MDE review (`review / verify-review-result`) is green on that head with no verified blocking finding;
- every review thread is resolved (0 unresolved);
- the PR body records the exception, the exact head SHA, and the checks that passed.

Every use is recorded in the PR and here. The exception ends automatically when a second collaborator with write access exists; the normal one-approval rule then applies with no bypass.

**Why:** the previous policy left runtime fixes unmergeable indefinitely or required repeated undocumented overrides. This keeps the approval requirement for any future second reviewer and limits the exception to the exact structural case.

**What a reviewer would have been asked:** whether the change is correct, safe, and in scope. That question is answered by the canonical review plus the required checks on the exact head; the PR body carries the reviewer fast path.

**First uses (2026-10-20):** PR #466 (CI risk tiering; exact head and checks recorded in the PR) and PR #369 (rental currency validation; head `c9083cc29a`). Their PR bodies record the exception, the exact checks, and the merge commit once merged.

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

## 2026-10-23 — PR #513 (restaurant contests premium UI)

**PR:** [#513](https://github.com/amoai-tech/mdeai/pull/513) · **Head:** `674ea925942324cf1fd9aee6e781ef9098c791fe` · **Merge:** `2aca0e73fdc87facc5cce65c3a6bec89a346c6df`

**Why:** the repository has exactly one collaborator, `amoai-tech`, who is also the PR author; GitHub cannot record a self-approval.

**Green on the exact head:** `floor`, `mastra-schema-init`, `review / review`, `review / verify-review-result`,
`deterministic chromium 1/3`, `2/3`, `3/3`, `deterministic Maps contracts`, `auth redirect + guard chromium`,
`real mobile composer chromium`, `browser report + result`, `Kilo Code Review`, `Vercel`, `Vercel Preview Comments`.
Unresolved review threads: **0**.

**Caveats:** Codacy reported `action_required` (advisory; no surfaced blocking finding; it does not gate merges here).
CodeRabbit and Greptile were rate-limited on this head — their green status is **not** review coverage.
This is the third recorded use of the exception; the structural fix (a second reviewer or a narrower review
requirement for UI/docs paths) remains open, exactly as the PR #150/#155 entry warned.

**What a reviewer would have been asked:** whether the one extra coordinate read for map pins belongs in the
contest adapter rather than the RPC, whether routing `HostErrorBoundary` through the new shared
`AppErrorBoundary` is behaviour-preserving (same `[host-os <label> crashed]` log), and whether the included
test-only clock fix for an unrelated flaky events test is acceptable in a UI PR.

**Nothing unreviewed rode along:** 22 files, `+2029/−513`. Product behaviour changes are limited to the two
contest routes, the nominee card/gallery, the map-slot error boundary (shared with Host OS), and the existing
brand placeholder gaining an optional class. The rest is tests, metadata, and one test-only clock freeze
(reported to SAN-583).

## Adding an entry

Record: the PRs, the date, the reason, which required checks had passed, what a reviewer would have
been asked, and any question left open. If an override becomes a habit, the rule is wrong and should
be changed deliberately — not worked around quietly.
