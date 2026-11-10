# Specification: Verified CopilotKit A2UI card identity

**Linear:** [SAN-1653 · MDE AI — Prove the Shared CopilotKit A2UI Foundation](https://linear.app/amo100/issue/SAN-1653)
**Intent:** [intent.md](intent.md)
**Status:** Planning example only; no feature acceptance proven
**Source baseline:** `main` `4d51af18e83c7bfeabcbe7957af43adab46d0d00`; issue checked November 9, 2026

## Current verified behavior

- `src/components/copilot/a2ui/mde-ui-catalog.tsx` defines the single `mde/discovery@1` catalog and existing `RentalCard`/`EventCard` wrappers.
- `findRentalRow` and `findEventRow` select records from authorized result histories; the catalog exposes `data-listing-id` and `data-event-id`.
- `src/components/copilot/search-tool-renders.tsx` supplies native `useRenderTool` results; this fallback is **not** evidence that AI `render_ui` succeeded.
- `src/mastra/lib/generative-ui-context.ts` supplies result-ID hints to the agent.
- `src/components/copilot/a2ui/__tests__/mde-ui-catalog.test.ts` covers catalog lookup and malformed IDs, but browser correspondence has not been verified in this docs change.

## User journey

An authenticated user searches Rentals or Events → receives ordered, authorized real results → asks for first/second/named/sixth item as an AI card → actual `render_ui` payload references the selected result ID → A2UI DOM card contains that same ID → Details opens the same record. After history replay, the card either resolves with authorized provenance or displays honest unavailability.

## Acceptance criteria and failure cases

| Given / when | Required observable result | Proof |
| --- | --- | --- |
| First, second, named and sixth result in **both** domains | Selected ordered result ID = `render_ui` prop ID = newly rendered DOM card ID = Details target ID (8 cases) | Authenticated browser / AG-UI event capture |
| Duplicate titles | Correct **ID** is used, not title or position guessed from prose | Browser assertion |
| Unknown, forged or stale ID | No card/Details from unauthorized or unrelated result | Catalog tests + browser negative case |
| Switched user/thread, late Stop/Retry | No previous-user result or late card reappears; no duplicate consequence | Isolation/recovery tests |
| Saved conversation reopened/refreshed | Authorized card restores or honest unavailable state | `e2e/chat-thread-history.spec.ts` |
| AI failure/abort | Native cards, map, filters and composer still usable | Existing failure E2E + 390px check |

## Interfaces and owners

- **UI:** `src/components/copilot/a2ui/mde-ui-catalog.tsx`, `src/components/copilot/search-tool-renders.tsx`, current chat provider.
- **Agent:** `src/mastra/lib/generative-ui-context.ts` → existing agent → `/api/copilotkit`.
- **Source of facts:** authorized results already fetched via existing Rental/Event search; no new database table or query engine.
- **Tests:** `src/components/copilot/a2ui/__tests__/mde-ui-catalog.test.ts`; existing chat-history, recovery and rental/event browser specs.

**Non-goals:** standard catalog components belong to [SAN-1654](https://linear.app/amo100/issue/SAN-1654); Surfaces belong to [SAN-1656](https://linear.app/amo100/issue/SAN-1656). Generic transcript replay belongs to [SAN-1639](https://linear.app/amo100/issue/SAN-1639); outage resilience to [SAN-1245](https://linear.app/amo100/issue/SAN-1245).

**STOP:** Do not mark SAN-1653 Done or claim production readiness from a docs review or native-card fallback alone. Execute [plan.md](plan.md) and record independent evidence in Linear.
