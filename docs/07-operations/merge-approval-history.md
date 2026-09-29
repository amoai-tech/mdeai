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

## Adding an entry

Record: the PRs, the date, the reason, which required checks had passed, what a reviewer would have
been asked, and any question left open. If an override becomes a habit, the rule is wrong and should
be changed deliberately — not worked around quietly.
