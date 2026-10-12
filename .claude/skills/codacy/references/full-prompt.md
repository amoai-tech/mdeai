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
   - verify Codacy and required PR checks on that exact SHA

## Final report

```text
Codacy findings:
- Found:
- Fixed:
- False positives/stale:
- Remaining:

Root causes:
- ...

Tests:
- Focused tests: PASS/FAIL
- Typecheck: PASS/FAIL
- Lint: PASS/FAIL
- Tests: PASS/FAIL
- Codacy local: PASS/FAIL
- Codacy Cloud: PASS/FAIL
- Required PR checks: PASS/FAIL

Commit:
PR head:

Blockers:
- None / list blockers

Verdict:
READY / NOT READY
```

Do not claim the PR is clean until Codacy Cloud and required checks pass on the exact pushed PR head.