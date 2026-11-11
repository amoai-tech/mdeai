# Pre-commit defect-prevention gate

Run this before every substantial task commit. The goal is to catch review findings before GitHub does.

## Fast path

```text
exact Git diff / scope check
→ Graphify for substantial code work with a current index; direct read for known docs
→ load domain skills
→ verify external contracts
→ static defect scan
→ targeted tests
→ typecheck/build only when required
→ UI/runtime proof only when required
→ commit
```

`git diff`, `git status`, and other Git-only scope checks may run before Graphify because they inspect the current change set rather than explore the codebase. For substantial code/caller discovery, use Graphify when its index is current. Known docs-only files may be read directly (`Graphify: N/A — exact known Markdown scope`).

## Required checks

- [ ] Every changed file belongs to this task.
- [ ] Review staged, unstaged and untracked paths; stage only task files, and never reset/clean or overwrite unrelated work.
- [ ] No stale iPix/Lumina/Brand/Planner/Shoot assumptions were copied into MDE code or instructions.
- [ ] No duplicate source of truth was introduced.
- [ ] No browser-provided org/user identifier is treated as authorization authority.
- [ ] No service-role key, secret, token, or sensitive URL can reach the browser.
- [ ] No fake/sample/fabricated fallback data was introduced.
- [ ] Every new CTA/link/route exists and has a verified owner.
- [ ] No N+1 query pattern or hidden truncation was introduced.
- [ ] No unnecessary abstraction, service, migration, RPC, or dependency was added.
- [ ] Every external API used is supported by the installed package version.
- [ ] Official docs/source were checked for load-bearing API, auth, security, or lifecycle assumptions.
- [ ] Empty, loading, error, negative, and tenant-isolation states are covered when applicable.
- [ ] Consequential writes preserve authenticated server authorization, user consent/confirmation when actually required, idempotency and independent S4 engineering review. **Never impose Phase A landlord/partner/ownership/moderation/publication business approvals as prerequisites.**
- [ ] Targeted tests prove behavior, not just implementation details.

## Evidence hierarchy

Use the strongest available evidence first:

1. Current runtime/live behavior.
2. Current task branch code and exact diff.
3. Current clean `origin/main`.
4. Installed package source/types and lockfile.
5. Live MDE schema/RLS/config read safely.
6. Official vendor MCP.
7. Version-specific official docs.
8. Official vendor GitHub repository/example.
9. Reviewer/bot suggestion.

A review bot or model suggestion is a hypothesis, never authority.

## Local automated review loop

When CodeRabbit/Qodo/local review tooling is available and safe for the diff, it may be used before push as an accelerator. It is not a required gate unless the repository provides a reproducible configured path. Detect the CLI portably rather than relying on a developer-specific path:

```bash
if command -v coderabbit >/dev/null 2>&1; then
  coderabbit review --agent -t uncommitted
  # or: coderabbit review --agent --base main
fi
```

Then use this loop:

```text
review uncommitted/base diff
→ classify findings by severity/domain
→ verify each finding against current code/runtime/official evidence
→ fix verified blockers/warnings
→ rerun targeted tests
→ rerun review
→ stop when no verified blocker/warning remains
```

Do not expose secrets or production data to review tooling. Never apply a reviewer suggestion without verification. Inspect staged, unstaged, and untracked task files plus directly affected callers/dependencies.

## Pre-merge handoff

After this gate passes, use [pre-merge-tests.md](pre-merge-tests.md) to select the smallest sufficient local/preview/browser/database test set before opening or updating the PR.

## Agent prompt

```text
Review the exact Git diff/scope first. Use Graphify for substantial code/blast-radius work when the index is current; inspect exact known documentation files directly. Confirm scope, secrets safety, current domain contracts, and installed API versions. Run local automated review when available, classify findings by severity, fix verified blocker/warning issues, and rerun review. Then run the cheapest targeted tests, typecheck/build/browser proof only when risk requires them. Do not commit with unexplained critical findings, fake data, dead routes, duplicate sources of truth, tenant/auth regressions, or known flaky P0 tests.
```
