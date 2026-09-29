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
node scripts/pr-agent/evals/score-review.mjs semver-boundary /tmp/review.md
```

The capture step selects the review comment that the recorded `mde-pr-agent-cert … head=<sha>`
marker certified, so an earlier push's review can never be concatenated with the current one, and it
exits non-zero when no marker exists for the requested head. `--head <sha>` scores a head that is no
longer the PR tip.

Exit `0` means the case expectation was met; exit `1` prints which part of the contract failed. For a
`clean` case the expectation is inverted: the command fails when a **material finding** was invented.

## Scope limit — stated plainly

Passing the deterministic tests proves the **scorer, the corpus, and the wiring** behave correctly.
It does not prove the model now catches PR #157-class defects. That requires a live canary PR
reviewed by the real workflow; this harness only makes the resulting verdict objective and
repeatable.
