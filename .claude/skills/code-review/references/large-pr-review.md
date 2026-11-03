# Large PR review — SAN-1609

Load when changed files exceed the PR Agent context budget or coverage is unconfirmed.
The canonical AI engine is still the pinned shared workflow. No parallel LLM engine.

## Exact owners and order

1. `.github/workflows/pr-agent.yml` — PR Agent shared workflow and separate advisory report.
2. `scripts/pr-agent/review-policy.mjs` — trusted base/head envelope and the single canonical excluded-footer parser. Markdown fences, quotes, indented code do not prove omissions.
3. `scripts/pr-agent/smart-review.mjs` — file-risk classification, structural JSON validation, exact SHA coverage, bounded *planning* of follow-up batches, one update-in-place comment.
4. `.pr_agent.toml` — exclude only three verified generated inventory snapshots from routine LLM review, not arbitrary documents or changed app code.
5. `src/__tests__/pr-agent-smart-review.test.ts` — automatic risk, JSON, coverage, stale SHA, repeat, and workflow contract proof.

## File risk and evidence

Critical: security, auth/RLS, payments, bookings, checkout, migrations, GitHub workflows.
High: other application code. Normal: tests. Low: narrative docs.
Generated: the three `docs/progress/data/{linear-data,pr-data,pr-files}.json`
snapshots. Excluded: lockfile, node_modules, agent mirrors. Unrecognized: UNKNOWN.
Never assume unknown is safe. GitHub PR file API can return at most 3,000 files.

Use the [GitHub PR-files endpoint](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests-files)
with pagination, compare to PR `changed_files`, and bind every result to the exact
base/head SHA. Missing patches or extra files prevent a COMPLETE coverage claim.

## Cheap validation, not AI review

`linear-data.json`: check JSON, issue count, unique `SAN-####` identifiers.
`pr-data.json`: check JSON, PR count and unique PR numbers.
`pr-files.json`: check JSON, numeric PR keys, unique nonblank paths and counters.
When available, check `pr-data`/`pr-files` PR IDs against the same head SHA.
These are specific checks based on actual MDE data, **not** comprehensive schemas,
provenance, real-time freshness, or full AI review. Missing data = UNKNOWN.

## Coverage states and batching

- COMPLETE: exactly matching SHA and persisted full AI review evidence, no exclusions, known patches and valid known generated records.
- PARTIAL: real excluded files / incomplete AI review; name those files.
- UNKNOWN: no persistent review state, partial inventory or missing exact proof.
- FAILED: provider/validator error or malformed review evidence.

AI-reviewed, deterministic validated and policy-excluded are distinct counts.
`planFollowupBatches()` binds each proposed batch to base/head, patch digest,
policy version and model config; it limits batch size/count, reuses proven matching
completed batches, and never executes an LLM. PR Agent already has built-in chunking.
Do not claim follow-up automation exists until a secure exact-patch reviewer action
and end-to-end test are installed. Keep the 6-call budget bounded.

Do not add a required docs-only review gate. Existing Floor, branch protection
and human approvals remain authoritative. Escalate unreviewed security-sensitive
files rather than declaring them reviewed. Do not execute untrusted PR-head code
with any write-capable token. The job imports **only PR base** code; therefore
on its own feature PR the new job cannot run until the trusted base contains it.

## Real example and verification

[PR #485](https://github.com/amoai-tech/mdeai/pull/485) changed 12 documentation
and snapshot files (23,883 additions). PR Agent's six model chunks excluded six
files. Three known snapshots can be validated without LLM input; the remaining
files still need explicit AI coverage or an honest PARTIAL/UNKNOWN status.

Run: `npx vitest run src/__tests__/pr-agent-smart-review.test.ts src/__tests__/pr-agent-review-policy.test.ts`, `npm run typecheck`, `npm run check:skills`, `npm run floor` and `gh pr checks 641 -R amoai-tech/mdeai`. Review the exact SHA and the single marker-based coverage comment only once the module exists in trusted `main`. Test provider failure, stale SHA, malformed JSON, quoted warnings and docs-only nonblocking handling.

Primary references: [PR Agent review/chunking](https://docs.pr-agent.ai/tools/review/), [GitHub status checks](https://docs.github.com/en/pull-requests/reference/status-checks), [GitHub Actions security](https://docs.github.com/en/actions/reference/security/secure-use), [GitHub reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows).
