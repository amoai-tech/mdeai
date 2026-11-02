# PR-Agent merged-workflow smoke test (not for merge)

This disposable pull request validates the live GitHub Actions PR-Agent configuration after MDE PR #674 merged to `main`.

Acceptance: the reviewer job executes the `pr-review-infra` workflow pinned on trusted MDE `main`, publishes a current-head review, and passes exact-head verification. The NVIDIA API key must remain a GitHub Actions secret. The code reviewer should not invent application failures from this docs-only change.

The primary is Nemotron 3.5 Lightning 30B; backup is Nemotron 3.5 Super VL 120B. This does not change MDE runtime, rentals, events, AI Concierge, database, or Vercel deployment.
