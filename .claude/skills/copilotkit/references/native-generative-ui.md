# Native generative UI and page Surfaces — MDE bridge checklist

**Owner:** `.claude/skills/copilotkit/SKILL.md`. This is an MDE overlay, **not** a copied upstream or a new agent. For distinct protocol-level A2UI fixed/dynamic schemas read `a2ui-protocol.md`; for `standardUI` and built-in-component selection read `standard-catalog.md`. It is intended for SAN-1630, SAN-1631, SAN-1041 and SAN-1632. SAN-739 keeps the existing tool renderer.

## 1. Verify versions and the actual integration

Historical repository snapshot (5 Nov 2026): CopilotKit React/Runtime **1.84.1**, Mastra core **1.81.0**, AG-UI client/core **1.0.2**, `@ag-ui/mastra` **2.0.2**, Next **16.4.3**. These versions are **not** permission to skip reading today's `package.json`, lockfile and installed source.

- **1.1 Inspect** `src/lib/copilotkit-transport.ts`, `src/lib/copilotkit-client-props.ts`, `src/app/api/copilotkit/[[...path]]/route.ts`; preserve matched same-origin single-route mode and `useSingleEndpoint: true`. Existing runtime auth, allowlist, rate limits and resource/thread ownership are part of the contract.
- **1.2 Inspect** `src/components/copilot/copilot-kit-provider.tsx` and `src/components/chat/chat-provider.tsx`: these are intentionally **different route owners**. Add one shared catalog configuration without nesting extra providers or breaking saved-thread replay and guest behavior.
- **1.3 Inspect** `src/mastra/copilotkit/logging-mastra-agent.ts` and installed `@ag-ui/mastra`/Mastra sources. Its `run(input)` wrapper passes sanitized RunAgentInput through `super.run(...)`; confirm per-run `tools`, `context`, `threadId`, `runId` and legitimate frontend tool names survive, including `render_ui`. Do not claim this from reading the wrapper alone: instrument/test the actual agent call.

**Official source and use:**
- https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/packages/react-core/src/v2/generative-ui/index.ts → **REFERENCE ONLY** exact available exports; check current installed `node_modules`; destination: `src/components/copilot/a2ui/mde-ui-catalog.tsx`; verify typecheck.
- https://docs.copilotkit.ai/backend/copilot-runtime → **REFERENCE/VERIFY** v2 runtime single/multi-route pairing; destination: existing runtime/transport files; verify endpoint and /info contracts.
- https://mastra.ai/docs/agents/tools → **REFERENCE** current agent/client tool semantics, not automatic proof of this adapter; destination: existing Mastra bridge; verify actual round trip.
- https://docs.ag-ui.com/concepts/architecture → **REFERENCE** tool event ordering (`TOOL_CALL_START` → `TOOL_CALL_ARGS` → `TOOL_CALL_END`) and state; destination: transport and tests; verify captured stream.

**Gate:** first give the existing provider a minimal, inert, typed **development/QA catalog**, because CopilotKit adds `render_ui` only to runs carrying that catalog. If the tool still does not reach the model, or AG-UI events do not reach the browser, isolate the proven adapter/provider boundary. Do not mistake a catalog-free request for a Mastra defect. Preserve the working `useRenderTool` path and never add legacy `a2ui: {}` middleware merely for native Components/Surfaces.

## 2. Create a small catalog using real domain IDs

- **2.1 Catalog:** https://docs.copilotkit.ai/generative-ui/components/catalogs and https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/packages/react-core/src/v2/generative-ui/catalog.ts → **ADAPT** `createGenerativeUI({ id: "mde/discovery@1", components: ... })`, synchronous strict Zod schemas, a description for each component and only the domain components needed. **CREATE** `src/components/copilot/a2ui/mde-ui-catalog.tsx`; use installed typed APIs. **VERIFY:** allowed components and prop shapes only; no model-generated price or write-capability.
- **2.2 Grounding:** **ADAPT** existing `src/components/copilot/rental-card.tsx`, `src/components/copilot/search-tool-renders.tsx`, `src/components/chat/rental-ui-context.tsx`, `src/components/rentals/rental-browse-view.tsx`, `src/components/events/event-browse-view.tsx`, and `src/lib/events/get-public-event.ts`. IDs select from the **current authorized results**, not unconstrained client-supplied IDs. Internal/external rental IDs can be opaque strings. **VERIFY:** forged/stale/cross-user IDs rejected; unknown facts are omitted or shown unknown.
- **2.3 Providers:** https://docs.copilotkit.ai/generative-ui/components → **PROVE FIRST** with a minimal display-only QA catalog via `generativeUI={{ ui: probeUI }}` on the **existing** appropriate provider, so the runtime advertises `render_ui` for that run. Once a tool/AG-UI/browser round trip succeeds, **ADAPT** production `generativeUI={{ ui: mdeUI }}` through existing discovery/chat providers (reuse `getCopilotKitClientProps`). Remove the QA-only probe; **VERIFY:** one stable catalog identity, no duplicate provider, correct auth/thread replay, and existing `useRenderTool` fallback.

## 3. Reuse existing page states, maps and actions

- **3.1 Surface:** https://docs.copilotkit.ai/generative-ui/components/surfaces → **ADAPT** bounded `GenerativeUISurface` with stable id, a small allowlist and real fallback → `src/components/rentals/rental-browse-view.tsx` and `src/components/events/event-browse-view.tsx`. **VERIFY:** page's existing `shownResults`/`shownEvents` and `useBrowseMapSync` remain authoritative; Clear restores native results; current query wins in overlapping runs. Guest Events search must remain possible without granting protected concierge access.
- **3.2 Model upstream behavior:** https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/examples/v2/generative-ui-shop/README.md → **MODEL ONLY** bounded page-area updates + fallback. DO NOT COPY the example's TanStack AI agent, Prisma schema, SQLite data, shop result data or payment flow. **VERIFY:** no parallel search or agent service added to MDE.
- **3.3 Safe actions:** https://docs.copilotkit.ai/generative-ui/components/state-and-actions → **ADAPT** `useGenerativeUIFunction` only if a real user gesture requires it → existing Details, map focus and checkout review owners. **VERIFY:** wrong ID/actor refused, user edits retained, no browser/service-role secrets or direct AI checkout.
- **3.4 Rental comparison:** [SAN-1041](https://linear.app/amo100/issue/SAN-1041) creates `src/components/copilot/rental-comparison.tsx` as a pure component **before** registering it with catalog. **VERIFY:** 2–4 real current results, accurate COP/month, existing Details and verified coordinates, 390px no body overflow.
- **3.5 Ticket selection:** [SAN-1632](https://linear.app/amo100/issue/SAN-1632) may create `src/components/copilot/a2ui/event-ticket-selector.tsx` after first reconciling tier `max_per_order`, pending inventory and COP. Reuse `src/components/events/event-ticket-tiers.tsx`, `src/components/modals/booking-checkout-modal.tsx`, canonical checkout API, Supabase RPC and Stripe TEST webhook. **VERIFY:** no made-up tier/price, user explicitly confirms, one paid order and correct wallet tickets, idempotent webhook.

## Inspector-first generative UI diagnosis (development/QA only)

Use the [official Inspector](https://docs.copilotkit.ai/inspector) before editing catalogs, providers or Mastra adapters:

| Symptom | Inspector tab | What to verify |
| --- | --- | --- |
| “No generative UI” | Provider configuration | Existing route-owner provider has `generativeUI={{ ui }}` (no new nested provider) |
| Surface remains empty / fallback | **Generative UI → Surfaces → Rejected operations** | Component is allowed, operation/schema valid, target surface ID exists |
| Component has missing/wrong values | **Surfaces → tree and data model** | Props, bindings, source-backed ID hydration and user edits |
| Model never calls a component/function | **Catalog** and **Prompt** | Component advertised to the model; function has a mounted handler; expected `render_ui` guide/tools provided |
| Card appears only in text, not page | **Conversation**, **AG-UI Events**, **Surfaces** | Correlate run/tool ID with actual visible page Surface |

Inspector's **Prompt** view shows what the model was offered for the last/next run. Use it to compare a bounded MDE catalog with an unnecessarily broad one; never claim token/cost savings without measurements. Inspect `ag-ui-and-tools.md` and `mastra-bridge.md` when the adapter/tool never arrives.

Use Inspector only in authorized development/QA. Debug endpoints/events may expose private prompts or user data: do not enable public debug feeds or paste raw tokens in review comments. Preserve the current `useRenderTool` fallback when native `render_ui` is unsupported or rejected.

## 4. Evidence required before task completion

- **4.1 Focused tests:** valid/invalid schema; real/stale/forged IDs; missing values; concurrent searches; failed tool or `render_ui`; thread switching/refresh; guest and signed-in isolation; keyboard and 390px; existing tool renderer fallback.
- **4.2 Real browser:** https://playwright.dev/docs/writing-tests → **ADAPT** existing MDE `e2e/` suites; capture one actual `render_ui` request/tool-event/UI display, screenshots and any errors. Do not use synthetic-only traces as production proof.
- **4.3 Release:** focused tests → lint/typecheck → `npm run check:skills` → `npm run floor` once on exact final SHA → authorized staged browser validation. Attach test outputs and matching deployed SHA. No production certification based solely on doc changes.

**Do not change database schema, install other AG-UI renderers, copy the upstream shop's commerce stack, or add browser automation agents to satisfy an unproven UI problem.** If a real domain-level SQL gap is found, hand it to the appropriate MDE domain owner with targeted reviewed migration/RLS tests.
