---
name: configure-codacy-cloud
description: Configure Codacy Cloud repository tools, patterns, and coding-standard integration using the Cloud CLI.
---
# Configure Codacy Cloud
Use `codacy tools`, `codacy patterns`, and `codacy repository` to inspect before changing configuration.

Organization coding standards are authoritative for tools/patterns they enforce. If Codacy returns a standard-enforcement conflict, change the owning standard rather than fighting it at repository level.

After configuration changes, reanalyze and wait before evaluating the result:
```bash
codacy repository --reanalyze-and-wait
```
Avoid `--force` imports unless unlinking a coding standard is an explicit, reviewed decision.

Official source: https://github.com/codacy/codacy-skills/tree/main/skills/configure-codacy-cloud
