# Historical documentation cleanup — 2026-11-10

These files were **relocated**, not discarded, to restore the canonical docs architecture and preserve dated evidence.

The original snapshots in this folder are historical references, not current task status or production certification. For active product behavior use `prd.md`, current `main`, live Linear, and the canonical numbered docs folders.

| Former path | Preserved location |
| --- | --- |
| `docs/UIUX/evidence/` | `uiux-evidence/` |
| `docs/audits/` | `audits/` |
| `docs/copilotkit/` | `copilotkit/` |
| `docs/copilotkit-mastra/` | `copilotkit-mastra/` |
| `docs/events/` | `events/` |
| `docs/plans/` | `plans/` |
| `docs/screenshots/` (tracked captures only) | `screenshots/` |
| `docs/superpowers/` | `superpowers/` |
| `docs/tasks/evidence/` | `task-evidence/` |
| `docs/tasks/testing/` | `task-testing/` |

Active documents were moved instead of archived:
- `docs/UIUX/copilokit-components/` → `docs/03-platform/copilotkit-mastra/genui-plans/`.
- `docs/engineering/` → `docs/07-operations/engineering/`.

Generated *new* ad hoc test screenshots should go under gitignored `test-results/mde-evidence/`, not inside the canonical docs tree; durable redacted test reports belong under `docs/06-testing/playwright/evidence/` and must be entered in `docs/index-docs.md`.

Paths embedded in preserved historical logs/JSON are contemporaneous evidence labels and may refer to their **former** location; do not mistake them for live executable paths.
