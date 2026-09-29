# PR-Agent review-quality evals (SAN-1312)

## What this is

A deterministic, **finding-level** scorer plus a six-case corpus. It answers two different
questions, and it is important not to confuse them:

| Question | Where it is answered | Is it a merge gate? |
| -- | -- | -- |
| Do the wiring, the corpus, and the reviewer instructions stay intact and correctly shaped? | `node --test scripts/__tests__/pr-agent-review-evals.test.mjs` | Yes — runs in `check:release-gates` |
| Does the reviewer actually catch a seeded defect and stay quiet on a clean PR? | A live PR-Agent run on a canary PR, captured and scored here | No — this needs a real model call |

The synthetic cases in the test file prove the scorer understands its own contract. **They are not
evidence that PR-Agent discovers anything**, and they must not be read as behavioural
certification. Behavioural certification requires a captured model-generated review; two are checked
in as fixtures (`pr-157-v045-recorded.md`, `pr-163-canary-v045-recorded.md`).

## Why scoring is finding-level

A review is not a bag of words. Materiality, severity, status, and the evidence for a defect are
read from **one finding**, never from the review body as a whole. Otherwise this sequence would
certify a fake PASS:

```text
"HIGH" from the risk summary
+ a validator name mentioned in one finding
+ a malformed example cited in a different finding
+ changes_required from an unrelated finding
= fake PASS
```

A `Risk level: High` line with no finding is a risk assessment, not a finding. A conservative
`Merge with caution` recommendation with no finding is a recommendation, not an invented defect.
Both are scored as such.

Findings are extracted in this order:

1. `<!-- pr-agent-review-state:v1 … -->` — PR-Agent's persistent finding state. Machine-readable,
   per-finding, carries `state` (ACTIVE/RESOLVED), `path`, and `last_run.head_sha`.
2. rendered `<details>` finding blocks (excluding the agent-run-details block);
3. labelled blocks split on the `Severity:` label MDE's review contract requires per finding.

### Golden requirement: a finding must be grounded in the changed source

A finding that names a defect the changed code does not contain is not a weak finding — it is a
false blocker, and it teaches people to override the reviewer. So a case may declare `sourceFile`,
and scoring reports `grounding` for **every** finding that quotes code:

```text
grounding=checked 1 finding(s) quoting code; ungrounded=1
  UNGROUNDED ["^\\d+\\.\\d+\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$","\\d+\\.\\d+\\d+"]
```

That output is the real PR #163 canary review, whose headline finding quoted a regex the reviewed
file does not contain and presented it as the current implementation. The fixture pair
`pr-163-canary-v045-recorded.md` (the review) and `pr-163-canary-source.mjs` (the exact source at that
head) pin that behaviour so it cannot silently return.

`grounded === false` is a **diagnostic, not a verdict**: a finding may legitimately quote a *proposed
fix*, which is correctly absent from the source. Read it as "verify which quote is the claim and
which is the fix" before crediting the finding.

### `detectionQuality` — read this before trusting a PASS

Severity and status are only readable when the model emits the structure `.pr_agent.toml` asks for.
The one captured model output that does contain findings (`pr-163-canary-v045-recorded.md`) returns
plain prose with **no** `Severity:`, `Status:`, `Evidence:`, or `Failure scenario:` labels at all.

When a credited finding carries its own `Severity`/`Status`, the score reports
`detectionQuality: "labelled"` — evidence, severity, and verdict all come from that one finding. When
it does not, the score reports `"unlabelled"`: the evidence still came from one finding, but the
blocking verdict had to come from the review's recommendation, and the PASS is correspondingly
weaker. Never hide that distinction when reporting a canary result.

## Corpus

| Case | Kind | Owner | Records |
| -- | -- | -- | -- |
| `semver-boundary` | defect | `code-review` | Real PR #157 false negative |
| `docs-only-control` | clean | `code-review` | Real PR #158 clean control |
| `supabase-rls-cross-tenant` | defect | `supabase` | Seeded |
| `stripe-webhook-replay` | defect | `stripe` | Seeded |
| `ci-silent-success` | defect | `code-review` | Seeded |
| `retry-partial-write` | defect | `code-review` | Seeded |

`semver-boundary` requires, inside one finding: the validator named, **at least one literal
malformed input** from `requiredExamples`, and enough boundary explanation to show why it fails.
Literals are used instead of a pattern because a pattern can be satisfied by ordinary prose —
an example the reviewer never actually named is not evidence that it tested the boundary.

## Run the deterministic check

```bash
node --test scripts/__tests__/pr-agent-review-evals.test.mjs
```

## Score a live review

Capture **exactly one** review for **one exact head**, then score it. Always capture with the
script — it reuses `scripts/pr-agent/review-policy.mjs`, the same marker logic the workflow uses,
and refuses to guess:

```bash
node scripts/pr-agent/evals/capture-review.mjs --pr <number> --out /tmp/review.md
node scripts/pr-agent/evals/score-review.mjs <case-id> /tmp/review.md <changed-file> [changed-file ...]
```

The capture step refuses to score a review it cannot tie to the requested head, because the
certification marker comment is **edited in place**: it accumulates every head it has ever certified,
so its timestamp is the time of its *last* certification, not this head's. A boundary drawn from it
alone hands back the newest review whatever head that review belongs to — which is how a canary
scores the wrong review and reports success. So:

- a marker must match the whole `<!-- mde-pr-agent-cert base=<sha> head=<sha> -->` shape — a bare
  `head=<sha>` substring inside prose does not certify anything;
- a comment carrying a review marker (`<!-- pr-agent:review:full -->`) or the standalone fallback
  shape is a review, never a certification record, even when it quotes a marker;
- identity is established from the strongest available evidence, and the capture prints which:

| `headEvidence` | Meaning |
| -- | -- |
| `review-recorded` | the review's own persistent state names this head |
| `newest-certified-head` | nothing names the head, but it is the **last** marker in the newest certification comment, so no later certification exists to confuse the boundary with |
| `unconfirmed` | neither holds — the command exits non-zero rather than guess |

`--head <sha>` scores a head that is no longer the PR tip. `--allow-unconfirmed-head` trusts the
boundary for a head that is *not* the newest certification; only use it when you hold separate proof,
and the capture prints that the head was **UNCONFIRMED**.

Pass **every file the review actually read** to the scorer. Grounding checks whether a finding's
quoted code exists in the source, so a review of a two-file PR scored against one file reports a
false `UNGROUNDED` for the quotes that live in the other. The post-merge canary is exactly that case,
and the regression test records it.

Verified against the real canary PR — replaying the recorded head returns the exact certified comment:

```bash
node scripts/pr-agent/evals/capture-review.mjs --pr 163 \
  --head 283412878f08ed370fb91e8cab58b463962c2059 --out /tmp/canary-replay.md
cmp /tmp/canary-replay.md scripts/pr-agent/evals/fixtures/pr-163-canary-v045-recorded.md
```

### The two live controls (SAN-1312 behavioural proof)

Run both after any change to the rule or the scorer. The bad canary must be *credited*; the clean
control must stay *uncredited*.

```bash
# bad canary: PR #163 head 7d86a2a58 — the real malformed-SemVer defect
node scripts/pr-agent/evals/capture-review.mjs --pr 163 \
  --head 7d86a2a58d59b00eed251f1e26a5b75102e6c2a5 --out /tmp/bad.md
node scripts/pr-agent/evals/score-review.mjs semver-boundary /tmp/bad.md \
  scripts/pr-agent/evals/fixtures/pr-163-canary-postmerge-source.mjs \
  scripts/pr-agent/evals/fixtures/pr-163-canary-postmerge-test.mjs

# clean control: PR #158 — a docs-only change with no defect to find
node scripts/pr-agent/evals/capture-review.mjs --pr 158 \
  --head e6644cd4313ed72a0b874a19c52974bc40918b31 --out /tmp/clean.md
node scripts/pr-agent/evals/score-review.mjs docs-only-control /tmp/clean.md
```

Exit `0` means the case expectation was met; exit `1` prints which part of the contract failed. For a
`clean` case the expectation is inverted: the command fails when a **material finding** was invented.

## Scope limit — stated plainly

Passing the deterministic tests proves the **scorer, the corpus, and the wiring** behave correctly.
It does not prove the model now catches PR #157-class defects. That requires a live canary PR
reviewed by the real workflow; this harness only makes the resulting verdict objective and
repeatable.

The live run has now happened, and both controls passed:

| Control | Head | Result |
| -- | -- | -- |
| **bad canary** (PR #163, seeded malformed-SemVer boundary) | `7d86a2a58` | real defect found, `01.2.3` / `1.2.3-alpha..1` / `1.2.3+build.` named, grounded (`ungrounded=0`, checked against both changed files), **Changes required** |
| **clean control** (PR #158, docs-only) | `e6644cd4` | 0 findings, `blocking=false`, nothing invented |

Both runs are recorded as fixtures and gated by `scripts/__tests__/pr-agent-review-evals.test.mjs`, so a
later change that loses the detection — or invents one on the clean side — fails the suite rather than
quietly passing. The earlier canary run on head `283412878` is kept as the counter-example: it scored
as a miss because it quoted a regex the file does not contain.

One honest limit remains: neither control exercised the rule on a PR that is **based on the new
`main` and clean**. The clean control predates the rule reaching `main`, so it proves the scorer does
not credit an invented defect but does not yet prove the new rule refrains from over-reporting on a
clean post-merge PR. The next clean PR reviewed on the new `main` closes that.
