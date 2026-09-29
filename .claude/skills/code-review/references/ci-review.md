# CI Review Reference

## Source of truth

1. Changed workflow/gate code and its tests.
2. Trusted repository CI conventions and exact action/container pins.
3. GitHub event, permissions, and shell semantics present in the diff/context.

## Review invariants

- Grant the GitHub token only the permissions the job needs.
- Third-party actions use immutable full commit SHAs; containers use verified immutable digests.
- Fork or untrusted PR code cannot receive repository secrets.
- A required command failure, silent skip, or pipeline failure cannot be converted into success.
- Path/event filters must run every required gate for affected files.
- Exact-head checks must certify the SHA they claim to certify.
- Logs/artifacts must not expose secrets or tokens.
- Timeouts, cancellation, retries, and concurrency must not create false-green status.

## Adversarial checks

Search specifically for a silent skip that exits 0, missing `pipefail` where a pipeline can hide failure, mutable `uses:` references, wrong event/path filters, and checks reporting success for a stale SHA.

## Advisory analyzer false positives

Codacy Static Code Analysis does not gate a merge on this repository (`floor` is the only required check). Read its findings on the merits, but these classes have been verified as false positives and should not be "fixed":

| Finding | Reality |
| -- | -- |
| "Hard-coded credential" in `upstream.yaml` | It is a 64-character sha256 tree hash, not a secret. The value is a content digest pinned by `check-skill-upstream.py`. |
| Rejects `#2-entry-in-rationalization-table`-style heading fragments | GitHub's own slug rules accept these. Rewriting them to satisfy the heuristic would break existing anchors. |
| "Dynamic path construction" on every `path.join` in a test file | Building a fixture path from `import.meta.url` is the correct, portable pattern and is not attacker-controlled. |
| `Critical · Security FileAccess` — "dynamically constructs file or path information" on `scripts/pr-agent/evals/fixtures/*.mjs` | The file is **recorded evidence**, not code: a byte-exact copy of the source a canary PR changed, read as *text* by the eval tests (`readFileSync(…, "utf8")`) and never imported or executed. Nothing can reach it at runtime. The rule is Opengrep's `Semgrep_javascript_pathtraversal_rule-non-literal-fs-filename`, whose stated premise is path data "constructed from user input" — but the flagged `ROOT` comes from the module's own `import.meta.url`, so the premise does not hold at all. Seen at PR #168 head `a780e5b09` on `pr-163-canary-postmerge-source.mjs:29`. Classified as test code in Codacy, not fixed: rewriting the fixture to satisfy the heuristic would destroy the evidence, and the code it copies exists nowhere else once the canary branch is closed. |
| "Absolute rule without escape hatch" on `AGENTS.md` prose | Deliberate. Safety and process rules are stated as absolutes on purpose; the escape hatch is that a rule changes at its owning level (see `AGENTS.md` § Instruction ownership). The heuristic fires on any sentence containing *never*, *only*, or *must*: it reported **8 findings on `AGENTS.md`** at PR #148 head `ab7fa30b6`, every one of them this class, including the paragraph that documents the false positive. The count tracks prose volume, not risk. |
| `Complexity: Method <name> has N lines of code` on a module-scope function | Codacy measures from the function's declaration line **to the end of the module**, not to its closing brace. Verified on `scripts/pr-agent/evals/score-review.mjs` at PR #161 head `24adb3b89`: Codacy reported `parseReviewSignals` at **124** lines; the function is **34** lines (31 non-blank, non-comment) and ends at line 58, while its declaration-to-EOF span is 127 lines in a 152-line file. Refactoring *inside* the function cannot clear it — the reported span always ends at EOF — so only a genuine cohesion problem justifies splitting the module. Confirm with `awk '/^export function <name>/,/^}/' <file> | wc -l` before acting. |

Never weaken production behaviour — or a gate's teeth — merely to silence an advisory heuristic. When a class turns out to be real, fix it and delete its row.
