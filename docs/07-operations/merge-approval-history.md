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

## 2026-09-29 — PR #150 and PR #151

**Both merged with an administrator override.**

**Why:** the repository has exactly one collaborator — `amoai-tech` — which was also the author of
both PRs. GitHub does not permit self-approval, so the required approval was not obtainable from any
account. The only alternatives were to leave docs-only changes unmergeable indefinitely, or to lower
the branch protection — which is worse, because it would remove the control for runtime PRs as well.
`floor`, `deterministic chromium`, `review`, `mastra-schema-init`, `Vercel`, Codacy and Kilo Code
Review were all green on both exact merged heads, and conversation resolution was satisfied with 0
unresolved threads on each.

**What the reviewer would have been asked to check:** for #150, whether `mvp.md` states the right
launch gates and the right rental critical path (Build → Prove → Certify), and whether the three
review rounds' dispositions were correct — specifically the removal of volatile production status and
the addition of host payout to the Events gates. For #151, whether the override wording was accurate
and whether listing `mvp.md` in the root docs index was the right discoverability fix.

**Nothing unreviewed rode along:** each PR was diffed against its reviewed head before merge and was
byte-identical, so each merged tree contains exactly what was reviewed. Merge commits `e1e33d4d7`
(#150) and `9e09e7eb9` (#151).

**Open question — structural, not procedural:** a protected branch with a one-member review
requirement can never be satisfied, so every PR faces the same choice.

**Standing condition.** The recording rule became self-defeating on this date: recording an override
requires its own PR, which requires its own override. Until the requirement is deliberately changed,
overrides under this condition are therefore recorded as **one dated entry per day** covering every
PR merged under it, plus a comment on each affected PR — not a new file change per merge. This entry
is that record for 2026-09-29. Options, in preference order:

1. **Invite a second collaborator.** Keeps the control meaningful and ends the loop.
2. **Scope the requirement so it excludes documentation-only paths.** Accepts that it no longer
   gates docs changes.
3. **Set the required count to 0** and rely on `floor` alone. Simplest, but it removes the review
   control from runtime PRs as well, so it is not recommended.

**Not a precedent.** A production PR — anything changing application behaviour, a database, or a
deploy — satisfies the approval requirement normally. A bypass is defensible only for a non-runtime
change whose reason is written down here.

## Adding an entry

Record: the PRs, the date, the reason, which required checks had passed, what a reviewer would have
been asked, and any question left open. If an override becomes a habit, the rule is wrong and should
be changed deliberately — not worked around quietly.
