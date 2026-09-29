---
name: codacy-cloud-cli
description: Query and control Codacy Cloud for repositories, PRs, issues, findings, tools, patterns, coverage, and reanalysis.
---
# Codacy Cloud CLI
Use the installed `codacy` CLI. Treat `codacy --help` and subcommand help as authoritative.

For an open PR:
```bash
codacy pull-request <PR>
codacy pull-request <PR> --reanalyze-and-wait
codacy pull-request <PR> --diff
```
Prefer `--reanalyze-and-wait` when the next decision depends on the completed result. Organization coding standards cannot be overridden at repository level; change the owning standard instead.

Codacy Cloud static reanalysis is separate from Codacy AI Reviewer.

Official source: https://github.com/codacy/codacy-skills/tree/main/skills/codacy-cloud-cli
