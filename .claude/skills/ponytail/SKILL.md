---
name: ponytail
description: >-
  Use before writing code on any MDE task, to decide whether the code should exist at all. Owns the
  reuse-before-build ladder, the source receipt that every consulted external reference must produce,
  the root-cause (single shared fix) rule, the `ponytail:` ceiling-comment convention, and the
  one-runnable-check rule. Trigger on "is there a faster/cheaper way", "build", "add a feature",
  "write a script", "integrate X", "automate Y", or any request that would otherwise open with new code.
---

# Ponytail — reuse before build

Own one question: **should this code exist?** `tasks` owns execution, `research` owns evidence
gathering, and the stack skills own implementation. This skill owns the decision that comes first.

Upstream: `references/official/ponytail/ponytail.md` (vendored read-only, pinned in `upstream.yaml`).
The ladder and discipline below are the MDE form of it; the source receipt is our addition.

## The ladder

Read the task and the code it touches, trace the real flow end to end, **then** stop at the first
rung that safely satisfies the requirement:

1. Does this need to be built at all? (YAGNI)
2. Does an existing repository helper, component, or pattern already do it?
3. Does the standard library already do this?
4. Does a native platform capability cover it — including an official dashboard or CLI surface?
5. Does an already-installed dependency solve it?
6. Does an official template, example, recipe, or CLI command cover it?
7. Only then: write the minimum code that works.

The ladder runs *after* understanding, never instead of it. Rungs 3–6 are where most tasks are won:
the platform and the dependency list usually already ship the answer.

Choose the earliest rung that satisfies **correctness, security, testability, reproducibility,
version compatibility, and automation**. A dashboard-only configuration is not sufficient when it
must be reproducible from Git — a setting that has to replay in every environment belongs in a
migration or committed config, not a console.

Do not build a custom abstraction merely because it is easy to write.

**Not lazy about:** understanding the problem first, input validation at trust boundaries, error
handling that prevents data loss, security, accessibility, and anything explicitly requested. Never
trade any of these for a smaller diff.

## Efficient implementation order

For substantial work, before writing custom code:

1. Check whether the requirement needs to exist.
2. Search this repository for an existing implementation.
3. Check installed packages and platform-native capabilities.
4. Check official dashboard, CLI, and configuration surfaces where relevant.
5. Read the official documentation for the exact installed version.
6. Inspect the official repository or a working example when behaviour matters.
7. Prefer an official template, example, recipe, CLI command, or prebuilt module.
8. Adapt the smallest supported solution.
9. Write custom code only for the remaining gap.
10. Leave a runnable verification proving the chosen solution.

Steps 5–7 are also where the source receipt comes from: the source you actually used is the one
worth recording.

## Bug fixes climb from the root

A report names a symptom. Grep every caller of the function you are about to touch and fix the
shared function once. Patching only the path named in the ticket leaves sibling callers broken, and
one guard in the shared function is a smaller diff than one guard per caller.

## Deliberate ceilings get a comment

When you knowingly cut a corner — a global lock, an O(n²) scan, a naive heuristic — mark it:

```ts
// ponytail: global lock; upgrade to per-key locks if contention shows up in metrics.
```

Name the ceiling and the upgrade path. An unmarked shortcut is indistinguishable from an oversight.

## One runnable check

Non-trivial logic leaves **one** runnable check behind: the smallest thing that fails if the logic
breaks. An assert-based self-check or one small test file is enough — no frameworks, no fixtures.
Trivial one-liners need none. Delete the check only when you delete the logic.

## Source receipts

Reading a doc is not reusing it. An external source that **materially affects the implementation or
the decision** produces one row — in the PR body, or in the task's evidence file. Background reading
gets none: an inflated citation table is documentation noise, and it buries the rows that mattered.
A source with no row did not influence the work, so it must not be cited as its justification.

The required fields are the contract in `AGENTS.md` § Evidence rules → Source receipts. This skill
owns the judgement, which is the part that gets misused:

- **COPY** — verbatim. Keeps its license/attribution and takes no local edits.
- **ADAPT** — same approach, changed to our conventions. State what changed.
- **MODEL** — follow the shape, write our own. State what we deliberately diverged on.
- **REFERENCE ONLY** — ships nothing, therefore it **requires a stated reason** plus the alternative
  you rejected. An unexplained `REFERENCE ONLY` is how this rule becomes decorative: it lets any
  amount of reading stand in for a decision.

A receipt is cheap. The failure it prevents is expensive: six weeks later nobody can tell whether a
pattern was copied from a current official example or recalled from memory.

## Two kinds of proof

Do not confuse verifying the source with verifying our use of it.

- **Source proof** — the API, behaviour, version, security property, or platform capability is
  confirmed against a primary source.
- **Implementation proof** — this repository is confirmed to use it correctly.

One never substitutes for the other. A URL is not a test; a passing test does not validate an
assumption nobody checked. Both are required, and the difference is where this repository's most
expensive mistakes have come from.

## Verify the current contract before copying an example

Determine what this repository actually uses, in this order:

1. the installed package or pinned version (`node_modules/`, lockfile);
2. current source and types in this repo;
3. official documentation **for that version**;
4. official repository examples;
5. third-party examples, only when primary sources are insufficient.

Our pins lag upstream more often than not. A current upstream example applied to an older pinned API
is a new bug wearing a citation.


## Every task opens with one written line

Before the first edit, answer in one line: *is there a faster, smaller, or better-supported way to do
this than building it?* Name the rung you stopped at. When the answer is "write it ourselves", name
the rungs you checked and why each failed. This is the whole rule in practice — the ladder is only
real if the rung is stated.

## Example — adding a UI component

| Bad sequence | Preferred sequence |
| -- | -- |
| requirements → write a custom modal → debug focus trapping → debug keyboard navigation → patch accessibility → ship | requirements → search existing MDE components → check the installed UI package → check the official component recipe → adapt the accessible component → add only MDE-specific behaviour → Playwright verification |

The preferred sequence is shorter *and* lands more accessible, because focus handling and keyboard
navigation were already solved by the component that shipped.

## Worked example (this repo)

Task: stop an unreviewed migration reaching production before `supabase db push`.

- Rung 1 — does a check need to exist? Yes: a live near-miss had already happened.
- Rung 2 — does the repo already have it? Partly: `scripts/preflight-migration-release.mjs` existed.
- Rung 3/4 — **the platform already implements the rule.** `supabase db push` decides which files it
  applies via `ListLocalMigrations`, so the guard must mirror that, not invent a heuristic.

The first version asked Git "which files are untracked?" — rung 3 skipped, and it was wrong in both
directions (a gitignored migration was applied while the guard said PASS; an uppercase `.SQL` was
reported but never applied). Mirroring the CLI's own rule fixed both. Receipt:

| Field | Value |
| -- | -- |
| URL | `https://github.com/supabase/cli/blob/develop/apps/cli-go/pkg/migration/list.go` |
| Source | `ListLocalMigrations` (`fs.ReadDir`, top level only, directories skipped) and `migrateFilePattern` in `apps/cli-go/pkg/migration/file.go` |
| Disposition | ADAPT |
| Destination | `scripts/preflight-migration-release.mjs` (`CLI_MIGRATION_FILE_PATTERN`, `listPushableMigrations`) |
| Verification | `node --test scripts/__tests__/preflight-migration-release.test.mjs`, plus a live `db push --dry-run` on the planted-file fixture |

## References

- `references/source-map.md` — the authoritative source to check per area, and how to use it.
- `references/official/ponytail/ponytail.md` — vendored upstream rule (read-only).

## Verification

The rule is satisfied when the diff is the smallest that safely works **and** every consulted source
has a receipt with a real destination and a real verification command. A task with no receipts and no
stated rung has not shown that it climbed the ladder — it has only not mentioned it.
