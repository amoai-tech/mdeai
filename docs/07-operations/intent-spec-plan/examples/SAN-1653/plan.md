# Implementation plan: SAN-1653 · MDE AI — Prove the Shared CopilotKit A2UI Foundation

**Linear:** https://linear.app/amo100/issue/SAN-1653
**Intent:** [intent.md](intent.md) · **Spec:** [spec.md](spec.md)
**Feature status:** In Progress in Linear (checked November 10, 2026); **document example:** not feature-verified
**Baseline inspected:** `main` `4d51af18e83c7bfeabcbe7957af43adab46d0d00`
**Graphify:** N/A for this documentation-only pilot; use Graphify when executing the cross-file feature work.

## Resume checkpoint — verified November 10, 2026

- **Last verified:** [SAN-1653 · MDE AI — Prove the Shared CopilotKit A2UI Foundation](https://linear.app/amo100/issue/SAN-1653) is **In Progress**. In a separate read-only worktree at current `main` `be3355b4947e`, the real catalog and agent-context unit suites passed **22/22 tests across 2 files** (`vitest run src/components/copilot/a2ui/__tests__/mde-ui-catalog.test.ts src/mastra/lib/__tests__/generative-ui-context.test.ts`; reported runtime **3.08s**). No feature code changed.
- **Current blocker:** There is still **no authenticated browser proof** that a real AI card opens the selected event/rental ID or that saved A2UI cards replay correctly. Existing native-card and thread-selection tests cannot substitute.
- **Exact next action:** From a current-main QA worktree, run `npm run qa:auth:check` (credentials presence only), then execute the authenticated first/second/named/sixth Rentals + Events card→Details browser matrix with actual `render_ui` event capture. Use the existing role fixtures, record exact IDs and the head SHA in Linear; do not claim a PASS until the real browser journey succeeds.
- **Status owner:** Live Linear SAN-1653; this documentation example is not a progress tracker or feature certification.

## Pilot measurement — actual implementation-task verification

| Observable metric | Value | What this proves |
| --- | --- | --- |
| Focused verification | **22/22 unit tests pass**, runtime **3.08s**, current `main` SHA above | Existing catalog/context logic passes its current unit contracts |
| Repeated investigations / duplicate implementation | **Not measured**; no feature code changed in this pilot | No justified claim of reduced duplicate work |
| Valid code-review corrections from this pilot | **Not measured**; no implementation PR created | No justified claim of fewer review corrections |
| Comparable historical baseline / time saved | **Unavailable** | Do **not** claim the workflow is faster from one pilot |
| Real authorized browser A2UI + replay | **UNVERIFIED** | Must be completed in the existing SAN-1653 task |

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
- [ ] Add a focused **authenticated A2UI card-replay browser assertion** in the relevant existing E2E suite (or a focused SAN-1653 spec): capture a real `render_ui` card and its source ID, save/reopen the thread and refresh, then assert the rehydrated A2UI card carries the **same authorized ID** and opens the same Details target—or shows an explicit unavailable state when no longer authorized. Do not count native cards or restored thread selection as an A2UI replay pass.
- **Proof:** relevant `mde-ui-catalog.test.ts` and `generative-ui-context` tests, existing `e2e/chat-thread-history.spec.ts` **for thread selection only**, a separate exact-ID A2UI card-replay browser check, and relevant recovery/browser specs.
- **STOP:** unauthorized data, duplicate action, misleading "success", or replay regression.

### 4. Verify exact head and deliver

- [ ] Use targeted tests → lint/typecheck → `npm run floor` (mandatory before claiming Done for code changes) → authenticated browser proof. For docs-only changes, run the applicable documentation/skill checks and disclose any existing baseline failure. Use the same existing issue and **fewest PRs**; no docs-only PR just for SAN-1653.
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
