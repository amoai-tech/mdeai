# Frozen known-bad canary — malformed SemVer boundary

**Status:** frozen fixture, measured. Never merged.
**Task:** [SAN-1332 · Make PR-Agent verify API claims before blocking a PR](https://linear.app/amo100/issue/SAN-1332/san-1332-make-pr-agent-verify-api-claims-before-blocking-a-pr)
**Canary PR:** [amoai-tech/mdeai#185](https://github.com/amoai-tech/mdeai/pull/185) (experiment, closed)
**Canary branch:** `exp/frozen-semver-fixture` @ `989c0772a10d01a3833218c00fb8bc751ad9f001`

## What this is

The pre-fix state of `scripts/check-mastra.mjs` — an exact revert of the real fix commit
`fb2052f2b` ("fix(ci): reject malformed SemVer in the CopilotKit exact-pin check"). That commit
fixed a real false negative recorded on PR #157, where v0.45 reviewed the defective validator and
said **Safe to merge, score 95, 0 findings**.

The seeded defect is the validator's pattern:

```js
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
```

It uses `\d+` for the core components (leading zeros allowed) and a flat `[0-9A-Za-z.-]+` class for
the prerelease and build suffixes (empty dot-separated identifiers allowed). It is therefore a
genuine **false-green** canary: `node scripts/check-mastra.mjs` exits 0 and the recorded suite
passes 11/11 while the gate is broken.

## Why it replaced the previous canary

The previous canary (`exp/v045-canary-*`, PRs #177–#183) added a **new, gate-unwired** checker,
`scripts/check-agui-pin.mjs`, which does not exist on `main`. Every review therefore had several
**real, competing defects** to report. The recorded v0.45 re-runs named them explicitly:

| PR | What the review blocked on | Was it the seeded defect? |
| -- | -- | -- |
| #182 | "Missing CI Integration" — the checker is not in the `floor` gate | no |
| #182 | "Brittle Test Setup" — the harness string-replaces the script's path resolution | no |
| #183 | "Test Gap: Path Resolution Logic Untested" | no |
| #183 | "Missing CI Gate Integration" | no |
| #183 | "Incomplete Dependency Coverage" — `peerDependencies`/`optionalDependencies` unread | no |

PR-Agent spends its 6-finding budget on the loudest findings. It blocked on those and never reached
the SemVer boundary, so `v0.45 = 0/3` and `v0.46 = 0/3` measured **finding prioritisation**, not
defect detection. The instrument was invalid, and neither version's result meant anything.

`scripts/check-mastra.mjs` is already wired into `npm run floor` via `check:mastra`, and its suite is
already inside the `check:release-gates` glob. Nothing in this diff is a competing defect, so the
only reportable defect is the seeded one. `scripts/__tests__/pr-agent-canary-fixture.test.mjs`
asserts that property deterministically.

## Frozen inputs

Every value below was held constant across samples. Only the model's sampling varies.

| Input | Value |
| -- | -- |
| Base SHA | `fba5589dd136923ac608c74a9e4307afb24642f1` |
| Head SHA | `989c0772a10d01a3833218c00fb8bc751ad9f001` |
| Diff | 2 files — `scripts/check-mastra.mjs`, `scripts/__tests__/copilotkit-version-alignment.test.mjs` |
| Diff artifact | `semver-boundary-canary.patch` (3,659 bytes) |
| PR-Agent image | `sha256:548b760b81ab4b3f729182428695ccc1194bbf87528c2b1e2b2b07e5223af7b6` (v0.45.0) |
| Shared workflow | `amoai-tech/pr-review-infra@a3c9600de7a31184266fade8387359ccbb8e6d68` |
| Model | `nvidia_nim/nvidia/nemotron-3-ultra-550b-a55b` |
| Fallback | `nvidia_nim/nvidia/nemotron-3.5-lightning-30b-a3b` |
| `custom_model_max_tokens` | `32000` |
| `reasoning_effort` / `temperature` | unset by MDE — provider defaults |
| `.pr_agent.toml` blob at base | `63d1b46118ee011dc3943efae91c9526f7eb1461` (sha256 `a7d709f9901093ab…`) |
| Selected skills | `.claude/skills/code-review/SKILL.md`, `.claude/skills/copilotkit/references/review.md` |
| Skills token budget | `3200` |
| Review command | `/review` (full) — the event action is never `synchronize` |
| Detection contract | `semver-boundary` in `scripts/pr-agent/evals/cases.mjs` |

The skill selection was reproduced locally from the same changed-file list the workflow reads, and
that list matches `gh pr view 185 --json files`:

```bash
CHANGED_FILES_FILE=<changed-files.json> CHANGED_FILES_JSON='["scripts/check-mastra.mjs","scripts/__tests__/copilotkit-version-alignment.test.mjs"]' \
  node scripts/select-pr-agent-skills.mjs
# enabled=true
# paths=["/github/workspace/.claude/skills/code-review/SKILL.md","/github/workspace/.claude/skills/copilotkit/references/review.md"]
# max_tokens=3200
```

## Proven locally before spending any model call

```text
malformed wrongly accepted by the fixture pattern: 7/12
well-formed wrongly rejected:                     0/8
node scripts/check-mastra.mjs                      exit 0    (CI stays green — false-green canary)
node --test copilotkit-version-alignment.test.mjs   11 pass / 0 fail
node --test pr-agent-canary-fixture.test.mjs         6 pass / 0 fail
```

Accepted but invalid: `01.2.3`, `1.02.3`, `1.2.03`, `1.2.3-01`, `1.2.3-a..b`, `1.2.3-a.`, `1.2.3-.a`.
Already rejected by the permissive pattern (so the fixture proves less than "all malformed input"):
`1.2.3-`, `1.2.3+`, `1.2.3.4`, `v1.2.3`, `"1.2.3 "`.

## How a sample is produced

One PR, then re-run the **same** workflow run. `gh run rerun` replays the identical event payload —
same action (`opened`), same base, same head, same diff — so the only variable is the model's
sampling. It also avoids re-triggering `floor` and the other PR workflows for each sample.

```bash
gh run rerun <run-id> --repo amoai-tech/mdeai

node scripts/pr-agent/evals/capture-review.mjs --pr 185 \
  --head 989c0772a10d01a3833218c00fb8bc751ad9f001 --out /tmp/sample.md
node scripts/pr-agent/evals/score-review.mjs semver-boundary /tmp/sample.md \
  scripts/pr-agent/evals/fixtures/semver-boundary-canary-source.mjs \
  scripts/pr-agent/evals/fixtures/semver-boundary-canary-test.mjs
```

`selectReviewCommand()` returns `/review` for any action other than `synchronize`, so every rerun is
a full review rather than an incremental one.

On a rerun PR-Agent does **not** edit its canonical persistent review — it publishes a standalone
fallback. So the sample must be read from the newest bot comment created **after** this rerun began,
not from `capture-review.mjs`, which correctly refuses a standalone for certification. Each sample
must still be captured before the next rerun starts.

## Reliability gate — **PASS, 9/10**

Ten samples of v0.45.0 against the identical frozen input. The gate is `>= 8/10` correct detections.

| # | Attempt | Verdict | Cited examples | Time cost |
| -- | -- | -- | -- | -- |
| 1 | 1 | **PASS** | `01.2.3`, `1.2.3-01`, `1.2.3-a..b`, `1.2.3-a.`, `1.2.3-.a` | — |
| 2 | 2 | **PASS** | `01.2.3`, `1.2.3-a..b`, `1.2.3-a.` | — |
| 3 | 3 | **PASS** | `01.2.3`, `1.2.3-01`, `1.2.3-a..b`, `1.2.3-a.`, `1.2.3-.a` | — |
| 4 | 4 | FAIL | none — named the validator and every boundary class, cited no literal input | 54.7s |
| 5 | 5 | **PASS** | `01.2.3`, `1.2.3-a..b`, `1.2.3-a.` | 37.3s |
| 6 | 6 | **PASS** | `01.2.3`, `1.2.3-a..b`, `1.2.3-a.` | 32.0s |
| 7 | 7 | **PASS** | `01.2.3`, `1.02.3`, `1.2.3-01`, `1.2.3-a..b`, `1.2.3-a.`, `1.2.3-.a` | 65.2s |
| 8 | 8 | **PASS** | `01.2.3`, `1.2.3-a..b`, `1.2.3-a.` | 22.6s |
| 9 | 9 | **PASS** | `01.2.3`, `1.2.3-01`, `1.2.3-a..b`, `1.2.3-a.` | 40.8s |
| 10 | 10 | **PASS** | `01.2.3`, `1.2.3-01`, `1.2.3-a..b`, `1.2.3-a.`, `1.2.3-.a` | 239.0s |

`01.2.3` was cited in **9 of 10** samples — every sample except the near-miss. Detection is stable on
this fixture, so the benchmark can support a version comparison.

Sample 4 is a near-miss worth reading rather than discarding: it identified the defect precisely —
"the EXACT_VERSION regex was reverted to a permissive pattern that accepts 12 classes of malformed
SemVer strings — leading zeros, empty dot-separated identifiers, empty prerelease/build metadata" —
and blocked, but never quoted a literal bad version. The case contract requires a concrete input, so
it scores as a miss. **The failure is citation, not comprehension.**

### Method correction — how an invalid 4/4 was avoided

The first pass at this gate reported "4/4 PASS". It was wrong. All four captures were byte-identical
(`sha256 920d933de31ec9c1…`) and the canonical comment's `updated_at` never moved off its creation
time: `gh run rerun` makes PR-Agent publish a standalone fallback, `capture-review.mjs` correctly
refuses it for certification, and the tool therefore kept returning the attempt-1 canonical review.
Four reads of one comment is not four samples.

The corrected harness snapshots the bot comment ids before each rerun and takes the newest
review-shaped comment that appeared afterwards. Standalone reviews are not certifiable, but they are
the model's real output for that attempt, which is what a detection rate measures. Every row above
comes from that corrected capture, and each has a distinct comment id.

