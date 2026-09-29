---
name: setup-coverage
description: Verify or configure Codacy coverage reporting for CI and pull requests without duplicating an existing coverage pipeline.
---
# Codacy Coverage
Inspect the repository's existing test coverage generation and upload workflow before adding anything. Reuse the existing reporter, report format, CI job, and secret when present.

For PR review, use `codacy pull-request <PR>` and `--diff` to verify whether coverage arrived and which changed lines are uncovered. “Waiting for coverage reports” is not proof that coverage is configured correctly.

Never create a second coverage workflow until the existing pipeline has been traced end to end.

Official source: https://github.com/codacy/codacy-skills/tree/main/skills/setup-coverage
