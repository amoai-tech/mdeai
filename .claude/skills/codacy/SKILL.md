---
name: codacy
description: Use when analyzing or fixing Codacy findings, reviewing Codacy PR quality or coverage, troubleshooting Codacy CLI analysis, or configuring Codacy locally or in Cloud. One MDE entry point for both Codacy CLIs.
---
# Codacy — MDE quality and configuration

One skill for Codacy local analysis, remote PR findings, coverage, and configuration. For general code review, `code-review` owns the review; load this skill only for Codacy-specific evidence. For PR merge decisions, keep `praudit` and `task-verifier` independent.

## Workflow

1. **Identify intent and exact state.** Locate repository/PR/current SHA and existing `.codacy/codacy.config.json`, CI coverage workflow and relevant CLI help. Never assume an analyzer actually ran.
2. **Local preflight (when configured):**
   ```bash
   codacy-analysis analyze --pr --fail-if-missing --output-format json
   ```
   Confirm JSON `toolResults` is non-empty and identify skipped/unavailable tools. If local config is absent, report **not analyzed locally**, not zero issues. Do not silently initialize, install, overwrite configs, or weaken the check.
3. **Cloud evidence:** use `codacy pull-request <PR> --diff` for introduced findings/coverage and latest analysis status. If the cloud result is stale and a rerun is justified, use `codacy pull-request <PR> --reanalyze-and-wait`. Distinguish queued/in-progress from completed.
4. **Triage:** classify each finding as confirmed, stale, false positive, or unverified with file/line/rule and source evidence. Fix only verified defects with smallest change; no blanket suppressions.
5. **Verify:** focused regressions first, then affected checks and `npm run floor` when shipping. After pushing, confirm PR HEAD, Codacy Cloud completion, introduced issues, coverage, and required GitHub checks on that same SHA. Do not claim approval or production readiness from Codacy alone.
6. **Configuration and coverage requests:** inspect the existing owner/pipeline; change Codacy settings only when explicitly requested, then verify analyzer and Cloud parity. Review the [operations reference](references/operations.md) only for those workflows.

## Safety and failure rules

- Local `codacy-analysis` and Cloud `codacy` are different CLIs. Use installed `--help` for command/flag contracts; they can share authentication, but never display tokens.
- A local run with zero analyzers or missing config is **not clean**. Local and Cloud tool coverage can differ.
- Avoid editing unrelated files or Codacy organization standards to silence a repository issue. Do not trigger Codacy AI Reviewer repeatedly; it is separate from static reanalysis.
- Do not change existing coverage CI, repository rules or analyzer configuration without authorization.

## Output

**Finding → evidence → fix → tests → local/Cloud status → exact SHA → remaining blockers.** State what was not run.
