---
name: openmuse
description: >-
  Use when improving MDE's existing AI Concierge chat, OpenMuse-style composer,
  Stop/Retry, queued messages, genuine tool progress, context-aware answers,
  grounded cards/map pins, search race recovery, or responsive chat/mobile UX.
  Adapt CopilotKit v2 patterns, not the OpenMuse app or a second chatbot.
---

# OpenMuse — reliable MDE Concierge interaction

## Owner and boundaries

Own **the user-visible conversation/search/map experience**. The user sees one
MDE AI Concierge, while authorized Mastra specialist agents/tools may operate
behind it. CopilotKit runtime/transport belongs to [copilotkit](../copilotkit/SKILL.md),
agents/memory to [mastra](../mastra/SKILL.md), rental data to
[real-estate](../real-estate/SKILL.md), and DB/RLS to
[supabase](../supabase/SKILL.md). Do not duplicate the runtime, provider,
thread store, search engine, maps, or domain workflows.

Phase A: never add listing eligibility, approval, ownership, photo-rights or
publishing prerequisites. Keep source attribution, server-side authorization,
private thread isolation and truthful coordinates, prices and availability.

## Implementation procedure

1. **Verify the real path.** Read the SAN task, active PR base, installed
   CopilotKit v2/AG-UI types and current MDE chat, fast-path hooks, tool renders
   and map. Compare only the relevant pinned upstream behavior using the
   [source map](references/source-map.md).
2. **One UI, correctly scoped context.** Reuse the existing chat-center-panel
   and canonical /api/copilotkit runtime. Keep user/thread identity server-owned;
   selected-page IDs/filters are untrusted hints. Selecting A, switching to B,
   closing the page or logging out must not leak old context.
3. **Actual progress, not a timer.** Show running/completed/failed/aborted
   stages only from real run/tool lifecycle events or returned data. Correlate
   thread + run + tool call; elapsed time may animate or dismiss a label,
   never assert completed steps or counts. If only coarse states exist, show
   "Searching…" instead of invented substeps. Owner: SAN-609.
4. **Never lose a second question.** When a fast-path search is busy, queue the
   next message, visibly keep it for retry, or return unhandled for Concierge
   fallback. Never claim "handled" while dropping it. Distinguish in-memory
   follow-up queues from durable server tasks; Stop preserves unsent drafts
   and does not imply external work is canceled. Owners: SAN-1559 / SAN-1407.
5. **Only current results own the map.** Old runs, prior chat's tool calls
   or virtualized result re-renders must not override newer selected results.
   Render pins only for verified coordinates. Owner: SAN-1429 for tool render
   effects and SAN-1407 for ordering.
6. **Smallest change and proof.** Reuse → configure → model upstream UX →
   minimal adaptation; never copy React Native. Test rapid overlapping
   searches (older finishes last), page A→B→clear, long chat virtualization,
   Stop/Retry, source/card/map agreement, disconnect, keyboard and 390px.
   Run focused tests, applicable lint/typecheck and exact-head floor.
   Report observed behavior, failed checks and exact SHA.

## Example

"Find Laureles apartments" then "Under COP 4M" before results return:
both requests remain accounted for. The current map cannot be replaced by a
stale result; the progress strip cannot claim ranking finished without a
real ranking-tool completion.

- [Source-to-destination map](references/source-map.md) — pinned source,
  behavior, MDE owner and verification.
- [Behavior probes](evals/evals.json) and
  [Trigger/near-miss probes](evals/trigger-evals.json).
- Skill routing/layout tests are not evidence MDE chat works.
