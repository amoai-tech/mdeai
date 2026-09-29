---
name: configure-codacy
description: Configure Codacy local analysis safely, including tool selection, patterns, config sync, and analyzer troubleshooting.
---
# Configure Codacy
Inspect current state before changing it:
```bash
codacy-analysis analyze --inspect
codacy tools
```
Prefer existing repository configuration and the smallest change. After Cloud tool or coding-standard changes, run `codacy-analysis update-config` and inspect again.

Do not use destructive/force imports merely to silence findings. Verify whether a setting is owned by an organization coding standard before attempting repository-level changes.

Official source: https://github.com/codacy/codacy-skills/tree/main/skills/configure-codacy
