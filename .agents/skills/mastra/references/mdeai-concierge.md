---
title: MDE AI Concierge — current Mastra runtime and grounded actions
description: Use when changing the in-process MDE concierge, tool outcomes, maps, memory, or persisted AI runs. Current source paths take priority over this guide.
parent: mastra
impact: HIGH
impactDescription: MDE agents, CopilotKit bridge, data boundaries, observability
tags: mastra, mdeai, concierge, copilotkit, agents, tools
---

# MDE AI Concierge — current implementation

**Scope:** This is a navigation guide for the existing Next.js + Mastra + CopilotKit implementation, **not** a scaffold or source of API signatures. Verify code, installed versions/types, and embedded Mastra docs before editing. The old `my-mastra-app`, standalone `/chat` SSE server, four-tool-only concierge, and separate Vercel Mastra deployment are historical, **not** the current app architecture.

## Canonical runtime owners (inspect these, do not create replacements)

| Concern | Current source |
|---|---|
| Agent and workflow registry | `src/mastra/index.ts` (at PR #717: 9 registered agents, 4 workflows; recount in current code) |
| Concierge instructions, tool selection, grounded results | `src/mastra/agents/concierge.ts`, `src/mastra/tools/` |
| Same-origin CopilotKit v2 endpoint | `src/app/api/copilotkit/[[...path]]/route.ts` |
| Runtime paths and single-route mode | `src/lib/copilotkit-transport.ts` |
| Mastra → AG-UI adapter, audit and turn outcomes | `src/mastra/copilotkit/logging-mastra-agent.ts` |
| Tool/action names used by frontend renders | `src/platform/copilot/mastra-tool-action-names.ts` |
| Thread-scoped memory + selected-pin clearing | `src/mastra/lib/agent-memory.ts` |
| Search/cards/pins | Existing Rentals and Events browse views, discovery tools, and `useBrowseMapSync` |
| Session, thread ownership, request context, rate limits | The current `/api/copilotkit` route and its helpers |
| AI run audit and costs | `src/mastra/lib/log-agent-run.ts`, `src/mastra/lib/mastra-telemetry.ts` |

The runtime resolves authenticated/guest context server-side, runs the registered Mastra agents in process through the existing AG-UI adapter, and logs turns through the existing `ai_runs` path. Do **not** create `my-mastra-app/`, `registerCopilotKit({ path: '/chat' })`, a new chat endpoint, or a second SSE/map-state pipeline.

## Working journeys

- **Rentals:** renter asks for a 2-bedroom place → search tool returns real inventory → existing cards/map use structured, grounded IDs and coordinates → Details → user requests a viewing → existing authenticated/authorized backend persists the lead/showing and reports the actual outcome. No Phase A landlord verification, owner paperwork, listing-publication, or viewing approval gates.
- **Events:** user/host asks about an event → grounded event tools/cards → authorized create/update or TEST checkout via existing API/DB/Stripe workflow → confirm persistence and signed webhook outcome, not merely an assistant message. Do not invent tickets, price, availability, or completed payment.
- **AI follow-ups:** conversation retains server-owned thread/resource identity. On refinement, reuse existing tool schemas and memory rather than regenerate data or convert assistant prose into pins/cards.

## Correctness, safety and failure handling

1. **Source truth:** location/price/availability/record IDs come only from the canonical tool/DB result. Unknown facts stay unknown; carry external source attribution. Never generate map pins from prose.
2. **Authority:** user-provided text, frontend tool args, and HITL approval only convey requests/intent. The server independently authorizes private reads/writes and validates actor/context; keep RLS and tenant isolation. Phase A has no business certification gates.
3. **Tool identity:** maintain the Mastra **tool-map key** expected by CopilotKit render/action registration; do not assume a `createTool({ id })` is the AG-UI frontend name.
4. **Memory:** preserve per-thread `threadId` and server-derived `resourceId`; verify isolation and concurrent updates (see `memory.md`). The selected-pin `null` clear is intentional.
5. **Streaming and Stop:** a completed stream, failure, timeout, and client abort are different states. A Stop before a committed write is not success; a committed write should not be undone merely because the user disconnects. Prove side effects and retries at the canonical API/DB boundary.
6. **Telemetry:** `LoggingMastraAgent` already classifies and records outcomes. Avoid a duplicate logging table/exporter or custom observability service merely to answer routine debug questions. Select explicit CLI targets.
7. **Version matching:** consult `node_modules/@mastra/*/dist/docs/`, `SOURCE_MAP.json`, installed types, and the reviewed lockfile before adopting a vendor example. Only upgrade the coherent Mastra/AG-UI family in its owning task.

## Focused verification

- Run `npm run check:skills` for these instructions and `npm run check:mastra` for registry/schema constraints.
- Run focused existing Vitest tests for tool mapping, AG-UI route ownership, memory, and AI telemetry, chosen from **current** test names; never assume a historical script exists.
- For user-facing changes, test one real authorized browse → cards/map → Details → action → DB readback path, plus unauthorized user, duplicate retry, error, Stop, and refresh where relevant.
- When reporting evidence, distinguish documentation/static tests, isolated agent turns, real browser/database journeys, and actual deployed outcomes. **This documentation change alone does not certify those journeys.**

Related: `references/memory.md`, `references/streaming.md`, `references/human-in-the-loop.md`; CopilotKit's `references/mastra-bridge.md`; https://github.com/mastra-ai/skills/tree/main/skills/mastra.
