---
name: copilotkit-review
description: Review MDE CopilotKit v2 and AG-UI changes for material runtime, identity, thread, transport, HITL, and Mastra integration regressions. Verify installed source/types before API claims.
metadata:
  owner: SAN-1312
  version: "1.0.0-mde.1"
---

# CopilotKit PR Review

## Source of truth

1. Changed MDE code and tests.
2. Installed @copilotkit/* and @ag-ui/* source/types.
3. Current official CopilotKit/AG-UI documentation.
4. Canonical MDE .claude/skills/copilotkit/SKILL.md.

Do not block from memory or stale examples. MDE currently pins @copilotkit/react-core and @copilotkit/runtime 1.55.2 and uses v2 React/runtime surfaces.

## Review invariants

- Preserve v2 imports such as @copilotkit/react-core/v2 and verified runtime v2 surfaces unless the PR proves an intentional migration.
- Preserve the same-origin /api/copilotkit runtime, auth, rate limits, telemetry, request context, and agent allowlists.
- Agent IDs and tool-map keys must resolve to registered Mastra agents/tools.
- Browser-supplied user, tenant, thread, run, page, or resource IDs are not authorization.
- Thread/connect/stop/cancel behavior must not cross user or tenant boundaries.
- Verify streaming, interrupts, HITL and AG-UI/Mastra behavior against installed package APIs.
- Stable provider/runtime props must not remount and silently lose conversation state.

## Finding discipline

For a v2 API/import defect, identify the exact changed import/API and include:
- Fix: restore the verified installed v2 surface or complete the intentional migration consistently.
- Verification: run the existing targeted CopilotKit tests, then npm run typecheck.
- Expected result: supported imports/APIs remain and targeted tests/typecheck pass.

For identity/thread findings, describe the smallest User A -> User B failure and require deterministic denial proof. Never propose autonomous merges, publishing, payment actions, or unrelated refactors.
