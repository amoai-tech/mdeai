# CopilotKit v2 runtime and React — MDE route-owner checklist

**Read for:** missing `render_ui`, provider remounts, /api/copilotkit 404/401, thread replay, failed tool forwarding, or a proposed transport change. Start from `AGENTS.md` and `../SKILL.md`; check current installed package pins instead of using historical comments or latest-main APIs.

## 1. Confirm existing owners before changing anything

1. **Provider:** `src/components/copilot/copilot-kit-provider.tsx` (discovery) and `src/components/chat/chat-provider.tsx` (chat). Both currently attach the shared `mdeUI` catalog. Preserve route-specific agent/auth/session/thread behavior and `SavedThreadReplay`. Do not add a nested provider to fix missing UI.
2. **Catalog and tests:** `src/components/copilot/a2ui/mde-ui-catalog.tsx`, `src/components/copilot/a2ui/__tests__/mde-ui-catalog.test.ts`. The catalog already has grounded rental and event cards; extend rather than create.
3. **Transport:** `src/lib/copilotkit-transport.ts` (canonical matching single-route constants), `src/lib/copilotkit-client-props.ts`, `src/app/api/copilotkit/[[...path]]/route.ts`. Keep `useSingleEndpoint: true` paired with handler `mode: "single-route"`; preserve authenticated user/thread ownership, rate limits and telemetry. An `/info` success does not prove the run route works.
4. **Mastra/AG-UI:** `src/mastra/copilotkit/logging-mastra-agent.ts`, `src/mastra/agents/concierge.ts`, `src/mastra/lib/generative-ui-context.ts`, and registered tool-map keys in `src/platform/copilot/mastra-tool-action-names.ts`. Read `ag-ui-and-tools.md` and `mastra-bridge.md` only when the error reaches this boundary.

## 2. Isolate one failure before editing

- No provider/catalog on that route → inspect route ownership, session startup and actual `generativeUI` prop first.
- No `render_ui` in model tool list → inspect Inspector **Catalog/Prompt** and the selected agent's run; confirm tool and guide/context forwarding through Mastra; do not install legacy A2UI middleware.
- Tool call exists but no UI → Inspector **AG-UI Events**, **Surfaces → Rejected operations**, component schemas/allowed Surface target, and data-model binding.
- Rendered card shows missing/wrong data → verify current authorized thread result and ID hydration, not an unconstrained model payload.
- Refresh, Stop/Retry, overlapping queries fail → test correct thread identity, cancellation and source-of-truth map/results; keep old search A from overwriting B.
- 401/403 or cross-user record → preserve fail-closed auth; never bypass RLS or import service secrets into browser code.

## 3. Minimum proof, appropriate to the change

1. Check the actual pinned `@copilotkit/react-core/v2`, `@copilotkit/runtime/v2` and `@ag-ui/mastra` source/types. Run existing contract and catalog tests plus `npm run typecheck`.
2. In authorized QA, verify one real model → tool call → AG-UI event → visible component; capture tool name, run correlation and Inspector rejection reason **without private prompt data**. Confirm fallback when the operation is invalid.
3. Verify guest/user thread isolation, stale/forged record IDs, user-edited controls, refresh/retry, and 390px mobile when affected. Run `npm run check:skills` for changed guidance and applicable `npm run floor` before claiming readiness.

## Official source receipts

- https://docs.copilotkit.ai/generative-ui/components/transports → **REFERENCE/VERIFY** tool vs Markdown contract; destination: existing provider/runtime pair; proof: actual tool exposure and AG-UI stream.
- https://docs.copilotkit.ai/generative-ui/components/surfaces → **ADAPT** bounded named page targets in existing browse page only; proof: browser fallback/clear and map-result consistency.
- https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/packages/react-core/src/v2/generative-ui/index.ts → **REFERENCE ONLY** exact pinned v2 exports; proof: installed typecheck.
- https://docs.copilotkit.ai/inspector → **REFERENCE** debug tabs; proof: correlated developer-only trace, not an assumption based on compilation.
