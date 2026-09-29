---
name: codacy-analysis-cli
description: Run Codacy static analysis locally before pushing. Use for PR preflight, changed-code analysis, scanner availability, and local Codacy troubleshooting.
---
# Codacy Analysis CLI
Use the installed `codacy-analysis` CLI. Treat `codacy-analysis --help` as the current command contract.

For an existing PR, prefer strict changed-code analysis:
```bash
codacy-analysis analyze --pr --fail-if-missing --output-format json
```
If dependencies are missing, install them in a separate run, then rerun strict analysis. Confirm `toolResults` is non-empty before saying the result is clean.

Use `codacy-analysis update-config` after Codacy Cloud tool/standard changes. Use `codacy-analysis analyze --inspect` to verify which analyzers are actually available locally.

Official source: https://github.com/codacy/codacy-skills/tree/main/skills/codacy-analysis-cli
