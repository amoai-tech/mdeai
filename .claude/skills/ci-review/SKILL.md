---
name: ci-review
description: Review GitHub Actions and CI changes for security, trigger, failure-propagation, and exact-head correctness.
---

# CI Review

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
