# Implementation plan: SAN-1653 · MDE AI — Prove the Shared CopilotKit A2UI Foundation

**Linear:** https://linear.app/amo100/issue/SAN-1653
**Intent:** [intent.md](intent.md) · **Spec:** [spec.md](spec.md)
**Feature status:** Todo; **document example:** drafted November 9, 2026
**Baseline inspected:** `main` `4d51af18e83c7bfeabcbe7957af43adab46d0d00`
**Graphify:** N/A for this documentation-only pilot; use Graphify when executing the cross-file feature work.

## Fastest safe path

Do not rebuild the catalog, agent, provider or query engine. Verify `mde/discovery@1` → current `RentalCard`/`EventCard` → existing `render_ui` and `useRenderTool` distinction → current Details actions. Fix a concrete failing owner only after reproducing it. The authoritative detailed runbook and live progress remain in [SAN-1653](https://linear.app/amo100/issue/SAN-1653).

## Ordered feature execution checkpoints (not performed by this docs PR)

### 1. Confirm current code and environment

- [ ] Refresh exact `main` or existing feature PR and the Linear description. Trace `src/components/copilot/a2ui/mde-ui-catalog.tsx`, `src/components/chat/chat-provider.tsx`, `src/components/copilot/search-tool-renders.tsx`, `src/mastra/lib/generative-ui-context.ts` and active agent/provider. Record exact versions and signed-in test role.
- **Proof:** file/line receipts, SHA, authorized QA route, no unrelated changes.
- **STOP:** do not assume native results are actual A2UI `render_ui` success.

### 2. Browser identity matrix first

- [ ] On authenticated Rentals and Events searches, select first, second, named and sixth results. Record ordered source ID → actual `render_ui` prop → new A2UI DOM `data-listing-id` / `data-event-id` → Details target. Include duplicate titles and unknown ID.
- **Proof:** eight exact-ID assertions and screenshots/redacted event log; not merely eight visible cards.
- **STOP:** on any mismatch, isolate whether the agent chose the wrong ID or the catalog resolved the wrong row. Do not add a second rendering path.

### 3. Reproduce, fix, and recover

- [ ] If the agent selects a wrong ID, check `generative-ui-context.ts` and relevant existing chat context. If catalog lookup fails with a correct ID, fix existing `findRentalRow`/`findEventRow`. Add one focused regression per proven defect.
- [ ] Test forged/stale/cross-thread or cross-user IDs, Stop/Retry late response, saved-thread revisit and refresh, and 390px error recovery.
- **Proof:** relevant `mde-ui-catalog.test.ts`, `generative-ui-context` tests, `e2e/chat-thread-history.spec.ts` and appropriate existing recovery/browser specs.
- **STOP:** unauthorized data, duplicate action, misleading "success", or replay regression.

### 4. Verify exact head and deliver

- [ ] Use targeted tests → lint/typecheck → `npm run floor` if implementation changed and the issue requires exact-head certification → authenticated browser proof. Use the same existing issue and **fewest PRs**; no docs-only PR just for SAN-1653.
- [ ] Inspect current-head GitHub review threads, verify each finding before fixing, reply/resolve with evidence, and record exact SHA/test results in the original Linear task.
- **Proof:** links to tests/PR/CI/redacted browser evidence and broker-free/guest-safe role handling as applicable.
- **STOP:** never assert Done/merged/deployed until separately verified.

## Evidence captured by this documentation pilot

| Item | Result | Evidence |
| --- | --- | --- |
| Exact Linear title, scope, dependencies | **PASS** | Live issue read November 9, 2026 |
| Existing catalog and test file paths | **PASS** | Local `main` read at baseline SHA above |
| Actual model `render_ui` and clicked Details | **UNVERIFIED** | Requires authenticated browser execution under SAN-1653 |
| Refresh, isolation and 390px experience | **UNVERIFIED** | Requires authenticated/browser and recovery tests |
| Runtime defect fix | **NOT ATTEMPTED** | Outside this docs workflow PR |

**Next real action:** run SAN-1653's eight-case authorized browser matrix, fix only the failing canonical owner, and update the existing issue. This plan is a **worked example**, not evidence that SAN-1653 is complete.
