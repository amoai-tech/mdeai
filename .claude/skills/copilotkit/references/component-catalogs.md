# Custom component catalogs — extend MDE's existing mdeUI

**Load when:** a task asks to create/change a custom AI-rendered React component, schema, slot, or catalog entry. For built-in components load `standard-catalog.md` instead; for page targets load `surfaces.md`. `.claude/skills/copilotkit/SKILL.md` remains the only CopilotKit skill owner.

## 1. Reuse the canonical catalog

1. Verify the installed `@copilotkit/react-core` pin, exported v2 types, and the current checkout. CopilotKit v1 and v2 imports are not interchangeable.
2. Inspect `src/components/copilot/a2ui/mde-ui-catalog.tsx`, `src/components/copilot/a2ui/__tests__/mde-ui-catalog.test.ts`, and existing `RentalCard`/`EventCard` definitions **before editing**. This catalog already exists: **EXTEND**, never CREATE a second `mdeUI` or attach another provider.
3. Decide whether the requirement is already met by the existing `useRenderTool` path, a pure React component (e.g. `src/components/copilot/rental-comparison.tsx`), or a standard component. Add a catalog entry only when the agent genuinely needs to compose that component.
4. Keep the catalog id stable and declare new component entries at module scope using the existing `createGenerativeUI` owner. Give each entry a precise `description` and strict, synchronous Zod `props`. Type the renderer with the installed `GenerativeUIComponentProps<typeof mdeUI, "ComponentName">` when appropriate, without creating circular runtime imports.
5. Model-supplied fields are **references**, not authority. Prefer opaque current-result IDs over supplied price, address, map coordinates, ticket quantity or availability; hydrate from the current authorized domain context and show unknown values as unknown. Preserve external-source attribution. Deny stale/forged/cross-user references without blocking normal Phase A development listings through business eligibility gates.

## 2. Slots, state and actions — only if needed

- https://docs.copilotkit.ai/generative-ui/components/catalogs → **ADAPT** the official `slots: { children: "single" | "multiple" }` pattern for top-level child slots; nested child references use installed `child()` / `childList()` helpers. **Destination:** existing `mde-ui-catalog.tsx`. **Proof:** a valid one-child / multiple-child tree renders, wrong child structure is rejected, and schema types compile. Avoid slots for ordinary data-only cards.
- https://docs.copilotkit.ai/generative-ui/components/state-and-actions → **ADAPT** live `bind`/`useGenerativeUIState`, `writable` and typed `useGenerativeUIFunction` only if a concrete interaction requires them. **Destination:** existing catalog plus the owning page and authenticated action/API. **Proof:** user edits survive a second model turn, unauthorized writes fail, retry does not duplicate side effects, and action success is displayed only after a persisted result.
- Do not add a client-side service key, new checkout path, parallel agent, or generic catalog helper to achieve a single feature. Review `references/native-generative-ui.md` **only when tracing runtime integration** (the parent skill links it directly).

## 3. MDE example — grounded rental comparison

**Request:** “Compare these three apartments.”

1. Reuse `src/components/copilot/rental-comparison.tsx` and identify its current result-ID/data contract; do not create another comparison widget.
2. If the agent must generate a comparison component, add a small typed entry to **existing** `mdeUI` accepting 2–4 opaque result IDs. Hydrate the data through the existing authorized rental context; never let the model choose factual COP prices or invent a map pin.
3. If the output belongs in a page panel rather than chat, load `surfaces.md` and register a bounded target separately. Catalog entries and Surfaces are **different concepts**.
4. Keep working `useRenderTool` cards/results and Details navigation. Invalid IDs render a safe fallback, not fabricated comparison rows.

## 4. Focused verification and source receipt

- `npm run check:skills`; `node --test scripts/__tests__/copilotkit-skill-contract.test.cjs`; `npx vitest run src/components/copilot/a2ui/__tests__/mde-ui-catalog.test.ts`; `npm run typecheck`.
- For an actual product component change, additionally prove valid and invalid schema, unknown ID, correct/current data, stale conversation, keyboard/390px, and one real browser `render_ui` round trip (model → Mastra → AG-UI → DOM). A unit test or catalog registration is **not** live integration proof.
- **Primary official source:** https://docs.copilotkit.ai/generative-ui/components/catalogs → **ADAPT** typed `createGenerativeUI` entries, descriptions, and slots. **MDE destination:** existing catalog and its tests. **Pass:** typed positive/negative fixtures and authorized results only.
- **Installed-version reference:** https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/packages/react-core/src/v2/generative-ui/catalog.ts → **REFERENCE ONLY**; inspect current `node_modules` if the pin differs. Do not copy upstream shop data or providers.
