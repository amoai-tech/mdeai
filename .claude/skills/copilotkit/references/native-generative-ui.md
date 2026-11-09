# Native generative UI — extend the existing MDE catalog and prove the bridge

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

**Gate:** `mdeUI` and its route-provider wiring already exist on `main`; inspect them before changing anything. An active catalog is required to advertise `render_ui`, but source/compilation alone do not prove the tool arrived in a live run. If no tool or browser render appears, isolate the actual provider → runtime → Mastra → AG-UI boundary using Inspector. Use a temporary inert QA component *within the existing catalog* only when necessary. Do not mistake a catalog-free test for a Mastra defect. Preserve the working `useRenderTool` path and never add legacy `a2ui: {}` middleware merely for native Components/Surfaces.

## 2. Extend the existing small catalog using real domain IDs

- **2.1 Catalog:** https://docs.copilotkit.ai/generative-ui/components/catalogs and https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/packages/react-core/src/v2/generative-ui/catalog.ts → **ADAPT** `createGenerativeUI({ id: "mde/discovery@1", components: ... })`, synchronous strict Zod schemas, a description for each component and only the domain components needed. **EXTEND** existing `src/components/copilot/a2ui/mde-ui-catalog.tsx` (current `RentalCard`/`EventCard` definitions), using installed typed APIs. Reuse `src/components/copilot/a2ui/__tests__/mde-ui-catalog.test.ts`; keep descriptions, strict Zod props and current authorized-result ID hydration. **VERIFY:** allowed components and prop shapes only; no model-generated price or write-capability.
- **2.2 Grounding:** **ADAPT** existing `src/components/copilot/rental-card.tsx`, `src/components/copilot/search-tool-renders.tsx`, `src/components/chat/rental-ui-context.tsx`, `src/components/rentals/rental-browse-view.tsx`, `src/components/events/event-browse-view.tsx`, and `src/lib/events/get-public-event.ts`. IDs select from the **current authorized results**, not unconstrained client-supplied IDs. Internal/external rental IDs can be opaque strings. **VERIFY:** forged/stale/cross-user IDs rejected; unknown facts are omitted or shown unknown.
- **2.3 Providers:** https://docs.copilotkit.ai/generative-ui/components → **VERIFY/ADAPT** the already configured `generativeUI={{ ui: mdeUI, agentIds: ["conciergeAgent"] }}` on `src/components/copilot/copilot-kit-provider.tsx` and `src/components/chat/chat-provider.tsx`. Do not re-add it or create a provider. Trace one real tool/AG-UI/browser round trip before claiming end-to-end success. **VERIFY:** stable catalog identity, no duplicate provider, correct auth/thread replay, and existing `useRenderTool` fallback.

## 3. Reuse existing page states, maps and actions

- **3.1 Surface:** https://docs.copilotkit.ai/generative-ui/components/surfaces and https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/examples/v2/generative-ui-shop/app/routes/_landing/+/index/featured-products.section.tsx → **ADAPT** bounded `GenerativeUISurface` with stable `id`, descriptive `description`, minimal `components` allowlist, native `fallback`, and `autoScroll={false}` when scrolling would disrupt browsing → `src/components/rentals/rental-browse-view.tsx` and `src/components/events/event-browse-view.tsx` *only if these regions are not already implemented*. **VERIFY:** page's existing `shownResults`/`shownEvents` and `useBrowseMapSync` remain authoritative; Clear restores native results; current query wins in overlapping runs. Guest Events search must remain possible without granting protected concierge access.
- **3.2 Model upstream behavior:** https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/examples/v2/generative-ui-shop/README.md → **MODEL ONLY** bounded page-area updates + fallback. DO NOT COPY the example's TanStack AI agent, Prisma schema, SQLite data, shop result data or payment flow. **VERIFY:** no parallel search or agent service added to MDE.
- **3.3 Safe actions:** https://docs.copilotkit.ai/generative-ui/components/state-and-actions → **ADAPT** `useGenerativeUIFunction` only if a real user gesture requires it → existing Details, map focus and checkout review owners. **VERIFY:** wrong ID/actor refused, user edits retained, no browser/service-role secrets or direct AI checkout.
- **3.4 Rental comparison:** [SAN-1041](https://linear.app/amo100/issue/SAN-1041) already has `src/components/copilot/rental-comparison.tsx`; reuse that pure component and check its existing tests **before** proposing catalog registration. **VERIFY:** 2–4 real current results, accurate COP/month, existing Details and verified coordinates, 390px no body overflow.
- **3.5 Ticket selection:** [SAN-1632](https://linear.app/amo100/issue/SAN-1632) may create `src/components/copilot/a2ui/event-ticket-selector.tsx` after first reconciling tier `max_per_order`, pending inventory and COP. Reuse `src/components/events/event-ticket-tiers.tsx`, `src/components/modals/booking-checkout-modal.tsx`, canonical checkout API, Supabase RPC and Stripe TEST webhook. **VERIFY:** no made-up tier/price, user explicitly confirms, one paid order and correct wallet tickets, idempotent webhook.

## 4. Feature recipes — choose only the needed one

### 4.1 Typed components, slots and existing data

- https://docs.copilotkit.ai/generative-ui/components/catalogs → **ADAPT** descriptions, synchronous strict Zod `props`, optional typed `slots` (`child`/`childList` from installed v2 exports), and stable catalog ID → existing `src/components/copilot/a2ui/mde-ui-catalog.tsx`; verify positive/negative schema and slot-shape tests. Use the current `RentalCard`/`EventCard` as examples, not model-generated price, URL or coordinates.
- Only add a slot when a real layout requires model-composed children; ordinary result cards remain in `useRenderTool`. Validate IDs against current authorized results and preserve older thread cards' Details without fabricating current map pins.

### 4.2 Named page Surfaces and fallback

- https://docs.copilotkit.ai/generative-ui/components/surfaces → **ADAPT** `<GenerativeUISurface id="..." ui={mdeUI} description="..." components={[...]} fallback={...} autoScroll={false} />` → existing rental/event page region, not a new route/provider. Set `autoScroll` to the behavior appropriate to each page; use an error boundary if an actual rendered component can throw.
- Test: fallback before generation; valid update; delete/clear restores native UI; rejected/unknown component retains usable fallback; overlapping run A/B does not show stale results; thread switch, refresh, mobile width and keyboard. Inspect **Surfaces → Rejected operations** first on failures.

### 4.3 Live state, writable props and typed user actions

- https://docs.copilotkit.ai/generative-ui/components/state-and-actions → **ADAPT** `state` and `bind` selectors in the existing catalog; register the corresponding `useGenerativeUIState(mdeUI, key, value)` in the relevant existing page/provider only while needed. State comes from real app data, not from a model-generated price, owner or inventory count.
- For user-input preservation, opt a concrete prop into `writable: ["value"]` *only after* checking its installed schema; the component receives the typed setter. Test that a second agent turn does not reset the user's edits.
- For actions, declare a typed catalog `functions` entry and register `useGenerativeUIFunction` at the existing owning UI boundary; check the installed function-caller permissions. Trigger consequential actions from explicit user events, then call existing authenticated server/RPC paths with idempotency and failure feedback. Never let a generated button mint roles, ticket prices, bookings or payment success.
- Start with **one** realistic journey (e.g., change ticket quantity → review amount → user confirms → server revalidates); do not introduce general-purpose state or action machinery.

### 4.4 Tool vs Markdown transport

- https://docs.copilotkit.ai/generative-ui/components/transports → **REFERENCE/VERIFY** current tool-based `render_ui` exposure: active catalog, runtime tool/context injection, Mastra adapter forwarding, AG-UI events and browser. Keep MDE's current same-origin tool transport as default.
- https://docs.copilotkit.ai/generative-ui/components/markdown-mode and https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/examples/v2/a2ui-markdown/app/page.tsx → **MODEL ONLY** `transport: "markdown"` with streamed `a2ui` fences. Do not enable in production without a concrete text-only-agent requirement, matching frontend render behavior, complete user-facing stream validation and comparison against the current tool path.
- Test malformed/partial JSON lines, mixed prose/UI, invalid component/surface IDs, refresh/retry, cancellation, and ordinary text fallback. Markdown validation happens in the browser rather than the tool-transport runtime.

### 4.5 MDE visual quality

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
- **4.3 Release:** focused tests → lint/typecheck → `npm run check:skills` → `npm run floor` once on exact final SHA → authorized staged browser validation. Attach test outputs and matching deployed SHA. No production certification based solely on doc changes.

**Do not change database schema, install other AG-UI renderers, copy the upstream shop's commerce stack, or add browser automation agents to satisfy an unproven UI problem.** If a real domain-level SQL gap is found, hand it to the appropriate MDE domain owner with targeted reviewed migration/RLS tests.
