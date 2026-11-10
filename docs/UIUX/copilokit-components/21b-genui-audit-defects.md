# 21b · GEN UI audit, defects and evidence

## 1. What was verified, and where

| Task | Verdict | Evidence (on `origin/main`) |
| --- | --- | --- |
| SAN-1630 catalog | WORKING | `a2ui/mde-ui-catalog.tsx` (`createGenerativeUI`, `mde/discovery@1`); tests assert forged-ID rejection |
| SAN-739 chat cards | WORKING | `search-tool-renders.tsx` → `RentalResults` → `RentalCard`; card/map parity tests |
| SAN-1041 comparison | WORKING | `rental-comparison.tsx`; monthly rent never derived from nightly × 30 |
| SAN-1631 page filters | WORKING | `browse/page-filter-tools.tsx` → `router.push`; `page-filter-control.test.ts` |
| SAN-1645 map highlight | PARTIAL | `tool-pins-sync.tsx` + `focus-map-pin-action.tsx`; **not A2UI** |
| SAN-1201 event publish | WORKING | `host-event-copilot-bridge.tsx` + `/api/approval-commit` with draft hash |
| SAN-1250 events Ask MDE | WORKING | `event-browse-view.tsx` + `DiscoveryAskComposer page="events"` |

## 2. Defects

| # | Sev | Problem | Root cause | Fix |
| --- | --- | --- | --- | --- |
| D1 | Critical (process) | Audit ran on a branch 636 commits behind main | stale checkout treated as current | worktree from `origin/main`; check ancestry before work |
| D2 | Medium | SAN-1631 body says PR #828 unmerged / not live | body never rewritten after merge | rewrite status paragraph; keep Done |
| D3 | Medium | SAN-1201 body says "In Progress / not authorized" | stale header | rewrite with verified bridge + HITL limitation |
| D4 | Medium | SAN-1645 title claims A2UI | title written before design settled | correct title/scope; keep Done |
| D5 | Medium | SAN-1637 has no acceptance criteria | fixed-format tracker | add measurable DoD |
| D6 | High (bounded trust boundary) | Untrusted browser context could be mistaken for instructions or authorization | The Generative UI guide entry is client-controlled; separate client ID hints also reach the agent | `hasGenerativeUIGuide` reads **only the guide entry’s presence**, never its value. `readRentalResultHints` / `readEventResultHints` parse bounded browser-supplied ID lists (first 20 context entries, at most 5 typed IDs, max 4000-character JSON), which `conciergeAgent` includes as *untrusted hints* in server-composed instructions; they do **not** authorize access. Each RentalCard/EventCard separately revalidates the selected ID against retained authorized tool results before displaying facts. Do not claim that all browser context is presence-only. |
| D7 | High | Standard components accept model-authored values | ungrounded family by design | guide forbids invention; grounded cards first; page allowlists |
| D8 | Low | `generativeUI={{…}}` object rebuilt each render | inline literal | hoist to module const (open) |
| D9 | Low | `standardUI` pulls a Lit-based dependency | upstream implementation | check bundle delta before merge (open) |

**Known prompt-label limitation (not changed by docs PR #841):** `readRentalResultHints` currently labels these browser-supplied IDs as `Current authorized rental result IDs` in its model-facing text, even though the source is untrusted. That label is **not an authorization check**. The card’s separate revalidation is the actual boundary. Align this wording in the application owner PR (#839 or a focused follow-up), not by copying browser values into trusted instructions.

## 2b. PR #839 implementation review round 1 — findings and resolution

The resolution descriptions below refer to changes made in **companion implementation PR #839**, not to code on this documentation-only PR #841 branch. On #841’s base `main`, the server guide still requires the `chat` target and exactly one custom card. This documentation PR does not modify that guide.

| Finding | Sev | Verdict | Resolution |
| --- | --- | --- | --- |
| Surface description conflicts with the no-prose rule | Minor | Valid | One rule: props carry tool data or a short label (8 words max). Panel allows one `Title`, no Text/Caption/Badge. |
| `Button` allowed with no bound action | Major | Valid | Button, Pressable and all inputs omitted until SAN-1655/1658 register functions. Guide says so. |
| Multi-card `Column` children unexplained | Major | Valid | Guide documents `children` as node ids and ships a two-card example; a test asserts it. |
| Omitted list may drift / under-tested | Medium | Valid | `MDE_OMITTED_STANDARD_COMPONENTS` exported and tested: every name exists upstream, every upstream name is exposed or omitted, no name is in both. |
| Guide references chat exclusively | Medium | Stale | Already replaced: "pick from the target list on the render_ui tool". |
| Surface missing from consumer inventory | Medium | Fixed in [PR #839](https://github.com/amoai-tech/mdeai/pull/839), not in this docs-only branch | PR #839 adds `src/components/copilot/a2ui/rental-recommendations-surface.tsx` to `scripts/copilotkit-consumer-inventory.json`. The base `main` and PR #841 do not contain that new entry. Verify it against PR #839's exact latest head, not `:388` on `main`. |
| Surface mounted unconditionally | Medium | Rejected | It must mount to register its target; conditional-on-target is circular. Renders nothing until targeted; one hook. |

## 3. Historical validation reported by implementation PR #839 (not tests executed on this docs-only branch)

| Check | Result |
| --- | --- |
| Focused Vitest (3 files) | 49/49 pass |
| Full Vitest | 640 files, 5540 pass, 51 skip, 0 fail |
| `tsc --noEmit` | pass |
| `npm run lint` (`--max-warnings 0`) | pass |
| Consumer-inventory contract | 9/9 pass |
| `audit:copilotkit-v2` | 0 violations, 0 new v1 imports |
| PR #839 required gates (separate from local checks) | Verify actual status against **latest PR #839 SHA**; earlier passing runs do not certify a newer commit. Not counted in the six local checks below. |
| Live browser `render_ui` | **not measured** (no authenticated QA session) |

**Reported local checks:** 6/6 passed in PR #839's implementation work (focused Vitest, full Vitest, tsc, lint, consumer-inventory contract, dependency audit). The separate PR #839 CI-gate row is **not** a seventh local check and must be re-verified on the latest head. These figures are *historical implementation evidence*, not tests run on PR #841 or a measured product success rate. Live browser `render_ui` remains unmeasured.

## 4. Scores /100 (rubric, not measured percentages)

| Task | SDK | Complete | Grounding | UI/UX | Security | Tests | E2E | Overall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SAN-1653 | 85 | 60 | 90 | 45 | 90 | 65 | 20 | 62 |
| SAN-1654 before → after | 0→85 | 0→70 | —→70 | —→50 | —→85 | 0→70 | 0→20 | 0→65 |
| SAN-1656 before → after | 0→85 | 0→70 | —→90 | —→55 | —→90 | 0→70 | 0→20 | 0→68 |

Rubric: 0–20 absent · 21–40 prototype · 41–60 core, major gaps · 61–80 functional, verification incomplete · 81–99 strong · 100 every criterion proven.

## 5. UI/UX

Before: AI answers about apartments live only in the chat sheet; the grid is unchanged, so the user matches prose to cards by hand.
After: a panel above the native results with the same cards. No focus capture, no scroll hijack, nothing rendered when unused.

Open checks: 1440/768/390 layouts, keyboard-open, dark mode for standard components, table overflow at 390px. Measurable: no-AI DOM unchanged; panel card id present in grid; Details id matches; zero horizontal scroll.

## 6. Supabase / pgvector

No table, column, RPC, policy, index or migration added. `searchRentals` uses the **caller-supplied, user-scoped RLS client when present**, otherwise a **shared anonymous client** for canonical rental search (`src/mastra/tools/search-rentals.ts`). In eligible non-development searches it may also include separately retrieved, explicitly allowlisted **public external advertisements** from `getOptionalExternalRentals` → `searchPublicExternalRentals` (`src/lib/rentals/mixed-rental-results.ts`, `public-external-discovery.ts`). That bounded, server-only path uses a service-role client to read specific slugs/landlord/metadata, then filters and projects public ad fields; it is **not a service-role path for user-scoped rentals or private broker inventory**. Public-source results remain source-attributed, unverified and non-bookable; the optional path is disabled in development mode. Cards separately re-resolve IDs against the authorized results retained on the current thread. Free-text rental search already uses hybrid retrieval (`searchRentalsIntelligent`, `hybridUsed`/`embedStatus`), so no new embedding, index or `match_*` function is needed. A read-only DB probe was attempted and abandoned when the pooler hung; no query ran, nothing changed.

## 7. Upstream references

| Reference | Verdict | Why |
| --- | --- | --- |
| OpenMuse | Adapt | composer/Stop/Retry/map sync already exist; only a "rendering…" state is worth taking |
| OpenDots | Adapt (1658) | reuse `platform/contracts/review-proposal.ts` (proposalId, target, baseVersion, draftHash) and `partner_profile_patch`; bind the edited draft; prove commit by readback |
| OpenBot | Reject | no epic outcome needs external browser/computer actions; it would add a trust boundary for no user value |

## 8. Source receipts

| URL | Source | Disposition | Destination | Proof |
| --- | --- | --- | --- | --- |
| docs.copilotkit.ai/generative-ui/components/standard-catalog | `standardUI.omit([...])` | ADAPT | `mde-ui-catalog.tsx` | presence/omission tests |
| docs.copilotkit.ai/generative-ui/components/surfaces | allowlist, `fallback`, `autoScroll` | ADAPT | `rental-recommendations-surface.tsx` | allowlist test + runtime guard |
| docs.copilotkit.ai/generative-ui/components/transports | tool transport default, runtime injects tool | COPY (decision) | — | `agent-utils.mjs:70-74` |
| github.com/CopilotKit/CopilotKit/blob/v1.84.1/…/GenerativeUISurface.tsx | `registerTarget`, runtime requirement | MODEL | surface guard | deterministic E2E unaffected |
