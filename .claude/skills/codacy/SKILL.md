---
name: codacy
description: Use when reviewing, troubleshooting, or fixing Codacy findings for an MDE pull request.
---
# @codacy

Review, troubleshoot, and fix Codacy findings for a pull request.

## Input

PR:

`[PR URL]`

## Workflow

1. Inspect the current PR head and use its existing worktree when available.
2. Do not reinstall, login, or run `codacy-analysis init`. Use the existing Codacy setup.
3. Run:

```bash
codacy-analysis analyze --pr --install-dependencies
codacy pull-request PR_NUMBER --diff
```

If Codacy Cloud results may be stale:

```bash
codacy pull-request PR_NUMBER --reanalyze-and-wait
```

4. Review every finding:
   - file + line
   - Codacy rule
   - root cause
   - real issue, stale finding, analyzer error, or false positive
   - smallest correct fix

5. Fix confirmed problems.
   - Do not blindly suppress rules.
   - Do not change unrelated code.
   - Prefer fixing the cause over disabling the check.

6. Test the affected code, then run appropriate project checks.

```bash
git diff --check
npm run typecheck
npm run lint
npm test
```

Run focused tests first when available.

7. Re-run Codacy:

```bash
codacy-analysis analyze --pr --fail-if-missing
codacy pull-request PR_NUMBER --reanalyze-and-wait
codacy pull-request PR_NUMBER --diff
```

8. If everything is correct:
   - commit
   - push
   - verify the pushed SHA is the PR head

For remaining steps, checks, and examples, see [full prompt](references/full-prompt.md).
