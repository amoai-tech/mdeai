# PR-Agent review-quality evals (SAN-1312)

## What this is

A deterministic scorer plus a six-case corpus. It answers two different questions:

| Question | Where it is answered |
| -- | -- |
| Does the reviewer catch this seeded defect, and stay quiet on a clean PR? | A live PR-Agent run on a canary PR, scored here |
| Is the wiring, the corpus, and the instruction the reviewer loads still intact? | `node --test scripts/__tests__/pr-agent-review-evals.test.mjs` |

The scorer never calls a model, so the same review body always produces the same verdict and every
result is reproducible from Git.

## Corpus

| Case | Kind | Owner | Records |
| -- | -- | -- | -- |
| `semver-boundary` | defect | `code-review` | Real PR #157 false negative |
| `docs-only-control` | clean | `code-review` | Real PR #158 clean control |
| `supabase-rls-cross-tenant` | defect | `supabase` | Seeded |
| `stripe-webhook-replay` | defect | `stripe` | Seeded |
| `ci-silent-success` | defect | `code-review` | Seeded |
| `retry-partial-write` | defect | `code-review` | Seeded |

`scripts/pr-agent/evals/fixtures/pr-157-v045-recorded.md` and
`scripts/pr-agent/evals/fixtures/pr-158-v045-recorded.md` are the **actual v0.45 production review
comments**, copied verbatim. They are the untouched baseline: PR #157 scored 95/100 and said
"Safe to merge" with zero findings.

## Run the deterministic check

```bash
node --test scripts/__tests__/pr-agent-review-evals.test.mjs
```

## Score a live review

After a canary PR has produced a PR-Agent review on the exact head, save **that head's** review
comment body to a file and score it against its case. Take only the newest full review, so an
earlier push's review body is never concatenated with the current one:

```bash
gh pr view <number> --json comments \
  --jq '[.comments[] | select(.author.login=="github-actions") | select(.body | contains("pr-agent:review:full"))] | sort_by(.updatedAt) | last | .body' \
  > /tmp/review.md
node scripts/pr-agent/evals/score-review.mjs semver-boundary /tmp/review.md
```

For a target head other than the latest, pin it explicitly with the recorded marker instead:

```bash
gh pr view <number> --json comments \
  --jq --arg head "<head-sha>" '[.comments[] | select(.body | contains("mde-pr-agent-cert") and contains("head=" + $head))] | last | .body' \
  > /tmp/review.md
```

Exit `0` means the case expectation was met; exit `1` prints which required signals were missing.
For a `clean` case the expectation is inverted: the command fails when a material finding was
invented.

## Scope limit — stated plainly

Passing this harness proves the **scorer and the corpus** behave correctly. It does **not** prove the
model now catches PR #157-class defects. That requires a live canary PR reviewed by the real
workflow; this harness only makes the resulting verdict objective and repeatable.
