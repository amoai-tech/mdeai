# Native generative UI — extend the existing MDE catalog and prove the bridge

**Owner:** `.claude/skills/copilotkit/SKILL.md`. This MDE overlay covers **runtime integration and full-journey proof**, not step-by-step catalog or page-Surface creation. For custom entries load `component-catalogs.md`; for named page targets load `surfaces.md`; for built-ins load `standard-catalog.md`; for distinct protocol A2UI load `a2ui-protocol.md`. Load only the reference the task needs. SAN-739 keeps the existing `useRenderTool` fallback.

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

**Gate:** `mdeUI` and its route-provider wiring already exist on `main`; inspect them before changing anything. An active catalog is required to advertise `render_ui`, but source/compilation alone do not prove the tool arrived in a live run. If no tool or browser render appears, isolate the actual provider → runtime → Mastra → AG-UI boundary using Inspector. Use a temporary inert QA component *within the existing catalog* only when necessary. Do not mistake a catalog-free test for a Mastra defect. Preserve the working `useRenderTool` path and never add legacy `a2ui: {}` middleware merely for native Components/Surfaces.

## 2. Verify the existing catalog and provider integration

- **2.1 Custom components:** use `component-catalogs.md` for typed Zod entries, slots, ID-only domain grounding and tests. The canonical catalog already exists at `src/components/copilot/a2ui/mde-ui-catalog.tsx`; do not create a second catalog.
- **2.2 Providers:** https://docs.copilotkit.ai/generative-ui/components → **VERIFY** existing `generativeUI={{ ui: mdeUI, agentIds: ["conciergeAgent"] }}` in `src/components/copilot/copilot-kit-provider.tsx` and `src/components/chat/chat-provider.tsx`. Preserve each route owner, thread replay and existing `useRenderTool` fallback. **PROVE:** one real model → Mastra → AG-UI → browser tool round trip before claiming feature integration.

## 3. Reuse existing page states, maps and actions

- **3.1 Page targets:** load `surfaces.md` when a task requires an AI-controlled page area. Keep existing rentals/events `shownResults`/`shownEvents`, maps, Details and guest behavior authoritative; do not mount a new Surface just to satisfy a documentation example. **VERIFY:** fallback, accepted update, clear, current search wins and 390px.
- **3.2 Model upstream behavior:** https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/examples/v2/generative-ui-shop/README.md → **MODEL ONLY** bounded page-area updates + fallback. DO NOT COPY the example's TanStack AI agent, Prisma schema, SQLite data, shop result data or payment flow. **VERIFY:** no parallel search or agent service added to MDE.
- **3.3 Safe actions:** https://docs.copilotkit.ai/generative-ui/components/state-and-actions → **ADAPT** `useGenerativeUIFunction` only if a real user gesture requires it → existing Details, map focus and checkout review owners. **VERIFY:** wrong ID/actor refused, user edits retained, no browser/service-role secrets or direct AI checkout.
- **3.4 Rental comparison:** [SAN-1041](https://linear.app/amo100/issue/SAN-1041) already has `src/components/copilot/rental-comparison.tsx`; reuse that pure component and check its existing tests **before** proposing catalog registration. **VERIFY:** 2–4 real current results, accurate COP/month, existing Details and verified coordinates, 390px no body overflow.
- **3.5 Ticket selection:** [SAN-1632](https://linear.app/amo100/issue/SAN-1632) may create `src/components/copilot/a2ui/event-ticket-selector.tsx` after first reconciling tier `max_per_order`, pending inventory and COP. Reuse `src/components/events/event-ticket-tiers.tsx`, `src/components/modals/booking-checkout-modal.tsx`, canonical checkout API, Supabase RPC and Stripe TEST webhook. **VERIFY:** no made-up tier/price, user explicitly confirms, one paid order and correct wallet tickets, idempotent webhook.

## 4. Feature recipes — choose only the needed one

### 4.1 Live state, writable props and typed user actions

- https://docs.copilotkit.ai/generative-ui/components/state-and-actions → **ADAPT** `state` and `bind` selectors in the existing catalog; register the corresponding `useGenerativeUIState(mdeUI, key, value)` in the relevant existing page/provider only while needed. State comes from real app data, not from a model-generated price, owner or inventory count.
- For user-input preservation, opt a concrete prop into `writable: ["value"]` *only after* checking its installed schema; the component receives the typed setter. Test that a second agent turn does not reset the user's edits.
- For actions, declare a typed catalog `functions` entry and register `useGenerativeUIFunction` at the existing owning UI boundary; check the installed function-caller permissions. Trigger consequential actions from explicit user events, then call existing authenticated server/RPC paths with idempotency and failure feedback. Never let a generated button mint roles, ticket prices, bookings or payment success.
- Start with **one** realistic journey (e.g., change ticket quantity → review amount → user confirms → server revalidates); do not introduce general-purpose state or action machinery.

### 4.2 Tool vs Markdown transport

- https://docs.copilotkit.ai/generative-ui/components/transports → **REFERENCE/VERIFY** current tool-based `render_ui` exposure: active catalog, runtime tool/context injection, Mastra adapter forwarding, AG-UI events and browser. Keep MDE's current same-origin tool transport as default.
- https://docs.copilotkit.ai/generative-ui/components/markdown-mode and https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/examples/v2/a2ui-markdown/app/page.tsx → **MODEL ONLY** `transport: "markdown"` with streamed `a2ui` fences. Do not enable in production without a concrete text-only-agent requirement, matching frontend render behavior, complete user-facing stream validation and comparison against the current tool path.
- Test malformed/partial JSON lines, mixed prose/UI, invalid component/surface IDs, refresh/retry, cancellation, and ordinary text fallback. Markdown validation happens in the browser rather than the tool-transport runtime.

### 4.3 MDE visual quality

- https://docs.copilotkit.ai/generative-ui/components/theming → **ADAPT** *supported* typed `--a2ui-*` theme keys from `GenerativeUITheme` into the existing provider only if standard UI is enabled; reuse the MDE design tokens and `DESIGN.MD`, not a second design system. Check light/dark text contrast, focus, touch targets, card hierarchy, reduced motion and 390px overflow before merging.
- `src/app/globals.css` and existing components remain the design source of truth. Visual refinements should not rewire the catalog/transport unless needed.

## 5. Inspector-first generative UI diagnosis (development/QA only)

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

## 6. Evidence required before task completion

- **6.1 Focused tests:** valid/invalid schema; real/stale/forged IDs; missing values; concurrent searches; failed tool or `render_ui`; thread switching/refresh; guest and signed-in isolation; keyboard and 390px; existing tool renderer fallback.
- **6.2 Real browser:** https://playwright.dev/docs/writing-tests → **ADAPT** existing MDE `e2e/` suites; capture one actual `render_ui` request/tool-event/UI display, screenshots and any errors. Do not use synthetic-only traces as production proof.
- **6.3 Release:** focused tests → lint/typecheck → `npm run check:skills` → `npm run floor` once on exact final SHA → authorized staged browser validation. Attach test outputs and matching deployed SHA. No production certification based solely on doc changes.

**Do not change database schema, install other AG-UI renderers, copy the upstream shop's commerce stack, or add browser automation agents to satisfy an unproven UI problem.** If a real domain-level SQL gap is found, hand it to the appropriate MDE domain owner with targeted reviewed migration/RLS tests.
