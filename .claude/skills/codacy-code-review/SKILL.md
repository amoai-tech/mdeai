---
name: codacy-code-review
description: Add Codacy local and Cloud evidence to pull-request reviews. Use for PR quality, security, coverage, duplication, introduced issues, and exact-head reanalysis.
---
# Codacy Code Review
Layer this skill on top of MDE's canonical `code-review`; do not replace the review owner.

## Efficient review trigger loop
Use the cheapest proof first:
```bash
# 1. Local preflight on changed code
codacy-analysis analyze --pr --fail-if-missing --output-format json

# 2. Fix verified findings, run relevant tests, push the exact branch HEAD

# 3. Reanalyze that pushed PR HEAD and wait
codacy pull-request <PR> --reanalyze-and-wait

# 4. Inspect introduced issues/coverage on the diff
codacy pull-request <PR> --diff
```

Do not repeatedly trigger Cloud while local findings are still being fixed. Confirm local `toolResults` is non-empty. Cloud can run analyzers unavailable locally, so final PR evidence must include Cloud results.

`--reanalyze-and-wait` triggers Codacy Cloud static analysis; it does **not** trigger Codacy AI Reviewer. When AI Reviewer is enabled and AI comments are wanted, use **Run Reviewer** only after the final pushed HEAD.

For requests like “Review PR #N using Codacy”: local preflight → verify/fix valid findings → focused tests → push → Cloud reanalysis → diff → report only remaining blockers. Never change correct production behavior merely to silence a heuristic.

Official source: https://github.com/codacy/codacy-skills/tree/main/skills/codacy-code-review
