# A2UI protocol — choose the correct CopilotKit integration

Read when work mentions A2UI schemas, declarative UI operations, fixed/dynamic schema, A2A, or AG-UI streaming. For **native React Components and Surfaces** (`createGenerativeUI`, `render_ui`, `GenerativeUISurface`), also read `native-generative-ui.md` when a task spans both protocol A2UI and native UI. For a native-only task, start with the native guide; this protocol guide is not a prerequisite. This guide is a **reference**, not approval to install an extra renderer.

## 1. Select the approach before editing

| Need | Use | MDE decision |
| --- | --- | --- |
| Display the result of an existing Mastra search tool | Existing CopilotKit v2 `useRenderTool` | Default for SAN-739; keep it working |
| Compose approved React cards in chat or an existing page area | CopilotKit **Components and Surfaces** with a typed `createGenerativeUI` catalog and `render_ui` | Preferred experimental path for SAN-1630/SAN-1631; prove transport first |
| Agent emits **protocol-level** A2UI operations to a compatible renderer | CopilotKit **A2UI middleware/renderer** after verifying installed support | Alternative integration; **not required** merely to use native Components/Surfaces |
| Known stable layout; agent supplies data | **Fixed Schema A2UI** | Prefer only if protocol mode is explicitly selected; less model work and layout drift |
| Unknown layout; secondary LLM generates schema and data | **Dynamic Schema A2UI** | Defer unless fixed/native approach cannot meet a concrete requirement; extra cost and validation |

**MDE rule:** Do not enable `a2ui: {}` in the existing `CopilotRuntime` or install `@copilotkit/a2ui-renderer` just to enable native `render_ui` Components/Surfaces. Those are distinct integration paths. The [generic CopilotKit A2UI setup](https://docs.copilotkit.ai/generative-ui/a2ui) documents the protocol middleware and is not a drop-in requirement for MDE's native catalog. Check current installed package signatures before selecting either path.

## 2. Protocol concepts and version compatibility

A2UI means **declarative data, not model-generated executable React/HTML/JavaScript**. The receiving client resolves a declared catalog and validates each component, property, data binding and action. The relevant protocol concepts are:

1. `createSurface` — initialize a surface/catalog.
2. `updateComponents` — update its approved component tree.
3. `updateDataModel` — populate values via data paths.

**Version check:** [a2ui.org](https://a2ui.org/) describes **v0.9.1 as the current production specification** and **v1.0 as a candidate** at the time this guide was written. CopilotKit's native Components docs describe compatibility with A2UI **v1.0-style** components. The older [CopilotKit A2A declarative starter](https://docs.copilotkit.ai/a2a/generative-ui/declarative-a2ui) explicitly uses a **v0.8-specific** operation list and local renderer. These envelopes are **not interchangeable**; do not copy v0.8 `beginRendering`/`surfaceUpdate` into v0.9+ code or assume the native `render_ui` input equals raw A2UI operation objects. Check negotiated/spec renderer versions, package exports, and actual message examples.

**AG-UI is the event transport, not the A2UI schema.** Tool calls, text, state and run lifecycle move as AG-UI events; an A2UI renderer (when actually enabled) interprets its own structured payload inside the supported tool/data flow. MDE retains the existing `@ag-ui/mastra` bridge and same-origin CopilotKit runtime.

## 3. MDE implementation decision and files

1. Inspect `package.json` and installed `@copilotkit/runtime`, `@copilotkit/react-core`, `@ag-ui/mastra`; confirm exact current behavior rather than assuming online examples match the pin. Identify whether the feature already uses `useRenderTool` or native `render_ui`.
2. Read `src/app/api/copilotkit/[[...path]]/route.ts`, `src/lib/copilotkit-transport.ts`, `src/mastra/copilotkit/logging-mastra-agent.ts` and `src/mastra/agents/concierge.ts`. Preserve the existing route mode, auth, tenant/thread context, logging and error behavior.
3. For MDE rentals/events, **stay with** `native-generative-ui.md`: a minimal **ID-only** component catalog (real listing/event IDs), trusted current-result resolution, existing cards/maps/Details and ticket review. Do not copy protocol renderers, Python A2A agents or the example restaurant/flight commerce stack.
4. If an **independent protocol-level A2UI integration** is later explicitly required, first prove the installed runtime's `a2ui` config, versioned envelope, renderer dependency and data binding contract in one isolated non-production spike. Only then modify backend/frontend together, using a feature fallback; keep this separate from SAN-1630's native `render_ui`.
5. Validate invalid component names, unknown/stale/cross-user IDs, unsupported property/bindings, malformed operations, out-of-order updates, aborted runs, slow streaming, refresh, 390px mobile and fallback. An AG-UI event trace **plus browser render** is required; JSON-valid output alone is not proof.

**Security:** catalog allowlisting does not authorize domain actions. Do not trust model-supplied rent, coordinates, ticket prices, Stripe amounts, URLs, roles or availability. Only explicit user gestures may start existing protected actions, with backend/RPC revalidation. No arbitrary script/HTML execution.

## 4. Source receipts — applicability

- https://a2ui.org/ — **REFERENCE** protocol concepts and version status; compare compatibility before implementation.
- https://github.com/a2ui-project/a2ui — **REFERENCE** specification, examples and security/trust boundary; do not vendor a separate runtime by default.
- https://docs.copilotkit.ai/generative-ui/a2ui — **REFERENCE/ADAPT ONLY if choosing protocol middleware** (`a2ui: {}`); not the native catalog setup.
- https://docs.copilotkit.ai/generative-ui/a2ui/fixed-schema — **MODEL** known schema with data-only updates; don't copy sample domain.
- https://docs.copilotkit.ai/generative-ui/a2ui/dynamic-schema — **REFERENCE** secondary-model tradeoff; do not enable automatically.
- https://docs.copilotkit.ai/a2a/generative-ui/declarative-a2ui — **REFERENCE ONLY** legacy A2A/v0.8 example; not the current MDE Mastra integration.
- https://docs.copilotkit.ai/agentic-protocols/ag-ui — **REFERENCE** event transport boundary.
- https://docs.copilotkit.ai/generative-ui/components — **ADAPT** native React Components/Surfaces approach for MDE instead of adding protocol middleware.

**Acceptance for this guide:** an agent can correctly choose the intended renderer, name its version and underlying transport, explain which files would change, and reject an unnecessary parallel middleware/agent install. No runtime claim without a captured real browser turn.
