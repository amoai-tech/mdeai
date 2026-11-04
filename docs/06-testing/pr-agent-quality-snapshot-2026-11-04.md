# MDE PR-Agent — 10-PR evidence snapshot (2026-11-04)

**Purpose:** Compare actual PR-Agent review **evidence**, coverage, and model-call reporting on different real MDE PRs. This is not an accuracy score or a replacement for tests, human review, or the exact-head verifier.

## Method (read-only)

- Retrieved public/private authorized GitHub PR metadata and the first 100 issue comments for 17 deliberately varied MDE PRs through the authenticated GitHub REST API.
- Selected 10 **distinct PRs with a bot-published ReviewEnvelope bound to the current PR head**. Compared the latest head-bound review and current-head advisory coverage comment where present; no new AI calls, PR edits, or reviews were triggered.
- The current PR head was bound; the **base SHA at the historical run was not re-certified**. Some PRs were reviewed under older configurations. A published bot comment can prove the review exists, but not that its findings are accurate.
- Source can be checked via `gh api repos/amoai-tech/mdeai/pulls/<PR>` and `gh api repos/amoai-tech/mdeai/issues/<PR>/comments?per_page=100`. A 100-comment ceiling and historical base movement can hide evidence. Missing state remains **UNKNOWN**, never FAILED or COMPLETE.

| PR | Changed files | Reported AI calls | Current-head advisory coverage | Persisted state complete |
| --- | ---: | ---: | --- | --- |
| [#724](https://github.com/amoai-tech/mdeai/pull/724) | 2 | 1 | UNKNOWN | Not recorded |
| [#658](https://github.com/amoai-tech/mdeai/pull/658) | 5 | 2 | COMPLETE | Yes |
| [#726](https://github.com/amoai-tech/mdeai/pull/726) | 4 | 1 | UNKNOWN | Not recorded |
| [#710](https://github.com/amoai-tech/mdeai/pull/710) | 7 | 1 | COMPLETE | Yes |
| [#702](https://github.com/amoai-tech/mdeai/pull/702) | 17 | 2 | UNKNOWN | Not recorded |
| [#605](https://github.com/amoai-tech/mdeai/pull/605) | 49 | 1 | Not available | Not recorded |
| [#654](https://github.com/amoai-tech/mdeai/pull/654) | 3 | 1 | Not available | Not recorded |
| [#719](https://github.com/amoai-tech/mdeai/pull/719) | 11 | 4 | COMPLETE | Yes |
| [#713](https://github.com/amoai-tech/mdeai/pull/713) | 7 | 2 | COMPLETE | Yes |
| [#688](https://github.com/amoai-tech/mdeai/pull/688) | 6 | 3 | COMPLETE | Yes |

## What the data actually proves

- **10/10** sampled PRs had a current-head ReviewEnvelope; **111 changed files**, **18 reported AI calls** across the sample. Neither metric proves that all changed lines were read.
- **5/10** had exact-head advisory **COMPLETE** plus `complete=true` persisted state; **3/10** had **UNKNOWN**, **2/10** lacked an exact-head advisory coverage comment. This is **coverage-evidence availability**, not the AI defect-detection success rate.
- **0/10** had a *reported priced dollar amount*. Two explicitly said provider costs were unavailable; the others had no amount. **Do not infer $0 or compute $/PR**.
- No incomplete-review footer was observed in these specific published current-head comments. That does **not** negate the separately executed pinned v0.49.0 **real 4-chunk PR #605 dry-run**, which identified one clipped file `docs/UIUX/01-progress.md` with `files_partially_reviewed`.
- **Finding precision/recall and latency percentiles are NOT measured**: no independently validated ground-truth defect set or consistent per-run timing for all ten. Avoid reporting invented accuracy, precision, recall or success rates.

## SAN-1634 correction and remaining quality work

The existing `scripts/pr-agent/review-policy.mjs` is the canonical parser for trusted top-level coverage notices. The SAN-1634 change exposes the clipped-patch names from that parser to `scripts/pr-agent/smart-review.mjs`: **partially-reviewed** is distinct from ai-reviewed, and giant patches are **deferred with a named line-bounded/human follow-up** rather than falsely counted as 100% reviewed. It does **not** perform another AI request or change branch-protection rules.

Next evaluation should measure **the same pinned reviewer configuration**, file risk mix, true defect test fixtures, actual provider YAML error rates, model fallback usage and source-linked human validation across another 5–10 future PRs. Use only executed calls/cost from trusted logs. Keep docs-only partial AI coverage informational and refer uncovered critical code to human review. Do not mix these open improvements into already delivered SAN-1609 or PR #724.
