# Standard catalog — use CopilotKit's built-ins without overexposing MDE

Read for `standardUI`, built-in layout/inputs/tables/charts/maps, extending a catalog, replacing built-ins, or deciding whether SAN-1630 should use all standard components. For the actual MDE implementation sequence, also read `native-generative-ui.md`.

## 1. Pick the smallest needed vocabulary

The official [CopilotKit Standard Catalog](https://docs.copilotkit.ai/generative-ui/components/standard-catalog) offers **69 built-in components** (including the 18 A2UI v1.0 basic components). It groups them into layout, text, inputs, data, media, overlays and composites. Availability and exact component props must be checked against the installed pinned `@copilotkit/react-core/v2/generative-ui` exports.

| User goal | Prefer | Why |
| --- | --- | --- |
| “Show me apartments in Laureles” | **Existing `useRenderTool` + MDE RentalCard** | Source-backed results, correct map/Details, no generated replacements |
| “Compare these three apartments” | **Typed MDE RentalComparison** | Uses existing results/verified prices and amenities, mobile layout |
| “Choose two VIP tickets” | **MDE EventTicketTiers / approved selector** | Server-priced amounts and quantities, explicit user review |
| “Show a non-sensitive summary table/chart” | Consider a **small allowlisted subset** of `Table`, `Chart`, `Text`, `Card` | Useful when underlying data is already verified |
| “Show my apartments on a map” | **Existing MDE map and pin sync**, not generic standard `Map` | Avoids second map, dependency and unverified coordinates |

**Default for SAN-1630:** create a **small custom domain catalog**, not `standardUI` with all 69 exposed. The entire standard catalog is an **opt-in** for a separately reviewed general-purpose UI use case. Passing `extends: [standardUI]` makes its components available too; it is **not** a narrowing/filtering mechanism.

## 2. Official usage examples (adapt, never paste into prod blindly)

**Unrestricted demonstration only** — illustrates the official API, *not recommended for MDE's domain catalog*:

```tsx
import { standardUI } from "@copilotkit/react-core/v2/generative-ui";
// Inside an existing CopilotKitProvider:
// generativeUI={{ ui: standardUI }}
```

**Extend the full standard catalog** — only if every exposed component is accepted:

```tsx
import { createGenerativeUI, standardUI } from "@copilotkit/react-core/v2/generative-ui";

const appUI = createGenerativeUI({
  id: "mde/general@1",
  extends: [standardUI],
  components: {
    // Verified, typed MDE components; read the installed catalog.ts API.
  },
});
```

For MDE's **existing small catalog**, extend `src/components/copilot/a2ui/mde-ui-catalog.tsx` with only the needed domain components. Do **not** expose all `standardUI` merely for one `Card`; reuse MDE cards first. If a real feature needs several built-ins, the installed CopilotKit **v1.84.1** API supports `standardUI.omit([...])` and typed `overrides`:

```tsx
import { createGenerativeUI, standardUI } from "@copilotkit/react-core/v2/generative-ui";

// Illustration only; apply to MDE only after checking needed component names.
const narrowedStandard = standardUI.omit(["Map", "Video", "HtmlView"]);
const ui = createGenerativeUI({
  id: "example/limited@1",
  extends: [narrowedStandard],
  components: {}, // MDE-specific typed definitions when required
  // overrides: { Card: { component: MdeStyledCard } }, // same Card props contract
});
```

- `omit` *removes named built-ins*; it does not produce an automatic domain allowlist. Check the remaining advertised names in Inspector, not just the removed names.
- `overrides` only replaces the React renderer of an included component, using that component's exact existing props; typecheck before using.
- Declare the catalog once at module scope; avoid `extends: [standardUI]` when unused components increase the prompt surface.
- https://docs.copilotkit.ai/generative-ui/components/standard-catalog → **ADAPT** selective omission and override semantics; https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/packages/react-core/src/v2/generative-ui/catalog.ts → **REFERENCE ONLY** installed-version source; destination: existing MDE catalog *only if needed*; verify TypeScript, Inspector catalog and unsupported-name rejection.

## 3. Catalog scope and prompt-cost verification

Choose the smallest vocabulary supported by the **existing route-owner provider and selected agent**. For example, Rentals needs an ID-backed rental comparison; Events needs ticket-tier selection. Neither should receive every general-purpose map, chart, form and media primitive by default.

- **Confirm the actual exposure mechanism.** `generativeUI={{ ui }}` advertises a catalog through its provider; adding `extends: [standardUI]` expands that vocabulary. A runtime agent allowlist is not proof that the UI catalog was narrowed per agent. Do not invent per-agent filtering APIs or nest new providers; inspect exact v1.84.1 typings and the model-facing prompt with [Inspector](https://docs.copilotkit.ai/inspector).
- **Measure before optimizing.** With the same authorized QA scenario and model settings, compare offered component names, the added generative-UI prompt/context size, response latency, and model usage when available. Record relative results and actual sources; do not invent token savings. Avoid logging private prompt contents.
- **Keep stable identity.** Share the existing small catalog where both MDE route providers need it; use existing tool renderers for ordinary grounded search. Only broaden vocabulary when a real user journey needs it and tests prove safe operation.
- **Negative control:** verify an unsupported component/function is absent from the advertised Catalog and fails safely instead of silently being accepted. Validate stale/forged IDs against the current authorized results.

## 4. Safety and behavior that matter for MDE

- **Inputs**: built-in inputs validate and preserve user edits; verify this on the actual installed version, especially after a later agent update. Do not let AI reset a user-edited ticket quantity.
- **Actions**: `Button` and `Pressable` can trigger browser behavior. Only enable whitelisted, user-invoked actions; backend/RPC owns authorization, price, inventory, viewing and payment.
- **Map**: the standard `Map` may need `maplibre-gl` and can fall back to a list; MDE already owns a map and pin mapping. Do not install MapLibre or replace the MDE map simply to exercise a built-in component.
- **Chart**: standard `Chart` uses the built-in chart integration. Accept only validated source-backed metrics, never invented counts or amounts.
- **Media/HTML/links**: do not allow untrusted URLs, arbitrary HTML execution or external embeds just because the catalog contains media components.
- **Surfaces**: allowed component names and a native fallback should be constrained per page; `GenerativeUISurface` never becomes a second source of results, filters or pins.
- **Provider**: use the existing `src/components/copilot/copilot-kit-provider.tsx` and `src/components/chat/chat-provider.tsx` owners; share one stable domain catalog; no nested runtime/provider or hosted Intelligence switch.
- **Release**: test 390px/keyboard, forged/stale IDs, user-edited controls, unknown component names, failed `render_ui`, old-turn results winning after a new turn, and existing card fallback.

## 5. Theme built-ins only when used

https://docs.copilotkit.ai/generative-ui/components/theming → **ADAPT** the typed `GenerativeUITheme` and provider `generativeUI.theme` configuration only for enabled standard components → the existing route-owner provider / MDE styling tokens (check `DESIGN.MD` and `src/app/globals.css`). **VERIFY:** typed `--a2ui-color-*`, `--a2ui-radius-*`, focus, dark/light mode and 390px layouts. Never add a second design system, and do not introduce generic charts/maps when existing MDE maps and domain cards suffice.

## 6. References with destinations and proof

- https://docs.copilotkit.ai/generative-ui/components/standard-catalog — **REFERENCE** the 69 built-ins, `standardUI`, input behaviors and MapLibre requirement; **destination**: catalog design decision; **proof**: count actual exposed components and check version-matched schemas.
- https://docs.copilotkit.ai/generative-ui/components/catalogs — **ADAPT** `createGenerativeUI`, component schemas and optional `extends`; **destination**: `src/components/copilot/a2ui/mde-ui-catalog.tsx`; **proof**: TypeScript and unsupported-component tests.
- https://docs.copilotkit.ai/generative-ui/components/surfaces — **ADAPT** bounded page Surface + fallback; **destination**: `src/components/rentals/rental-browse-view.tsx`, `src/components/events/event-browse-view.tsx`; **proof**: A→B→Clear and map/result ownership.
- https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/packages/react-core/src/v2/generative-ui/index.ts — **REFERENCE** exact pinned exports; **destination**: version-check; **proof**: compare current `package.json` and installed typings.
- https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/examples/v2/generative-ui-shop/README.md — **MODEL ONLY** bounded catalog/Surface/fallback; do **not** copy TanStack, Prisma or shop payments.

**Acceptance:** the coding agent explains why MDE should or should not expose each component, keeps generated props ID-only, preserves existing map/checkout and proves one real UI turn. Do not treat the built-in component count as an implementation target.
