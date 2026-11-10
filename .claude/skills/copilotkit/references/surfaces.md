# Generative UI Surfaces — bounded AI regions on existing MDE pages

**Load when:** a task asks the agent to render, update, clear, or debug AI-generated UI **inside a page area** rather than only in chat. Read `component-catalogs.md` only when the task also changes custom components. Keep `SKILL.md` as the single CopilotKit skill owner.

## 1. Verify the current page owns its state

1. Check the installed `GenerativeUISurface` export/props; inspect the existing `mdeUI` catalog and route-owner providers. Do not add a nested provider, second agent, new search engine or protocol A2UI middleware.
2. Inspect `src/components/rentals/rental-browse-view.tsx` or `src/components/events/event-browse-view.tsx`, existing `shownResults`/`shownEvents`, map synchronization and native loading/error/empty/success components. Confirm whether a target already exists before adding one.
3. Choose one **bounded** region whose generated content adds a real user capability. Existing results, map pins, Details, booking/viewing and thread replay remain controlled by their canonical app state, not by an unvalidated generated tree.

## 2. Target recipe

- https://docs.copilotkit.ai/generative-ui/components/surfaces → **ADAPT** the existing React `<GenerativeUISurface />` with a stable `id`, meaningful `description`, `ui={mdeUI}`, minimal allowed `components` and a **real native** `fallback`. **Destination:** the owning existing browse page; **proof:** agent sees only mounted targets and can render only advertised component names.
- Use `autoScroll={false}` where generated output would unexpectedly move the map/composer; otherwise retain the default. On item-specific targets, stable item identity avoids stale updates when selection changes.
- Fallback must remain usable **before generation and after delete/clear**. **Installed-version proof:** CopilotKit React **1.84.1** declares `GenerativeUIBaseConfig.errorBoundary?: GenerativeUIErrorBoundaryConfig` in `node_modules/@copilotkit/react-core/dist/runtime-context-*.d.mts`, with `onError(info)` and optional `fallback({ error, retry, surfaceId, componentId })`. This is the existing provider's `generativeUI.errorBoundary` configuration, **not** a new Surface prop. Recheck the installed type when upgrading; configure it only when error reporting/custom retry is needed. Never add another provider or error subsystem.
- Only include a component name after checking it exists in the selected catalog. Example: the existing `RentalCard` can be allowlisted; a new `RentalComparison` must be registered first, then a target may permit it. **Do not paste fictitious unregistered components into production.**

## 3. MDE example — comparisons beside the map

**Request:** “Compare the apartments currently shown, beside the map.”

1. Locate the existing results/map/detail state; keep it authoritative. Load `component-catalogs.md` only if the current comparison component is not yet accessible through the catalog.
2. Mount one comparison target only when that panel is present. Give it a stable purpose and allow only the registered MDE components needed for comparison.
3. Default to the page's current comparison/result presentation. An accepted agent update may replace this area but must **not** silently mutate search filters, the result set, coordinates, booking authority or active Details.
4. When the user clears comparison or changes thread, restore the native panel and remove stale generated content. If run A resolves after run B, B/current page state wins.

## 4. Verification matrix

| State or failure | Expected result |
| --- | --- |
| No agent operation | Native fallback visible and usable |
| Valid `render_ui` to a mounted target | Correct allowed component and current authorized data |
| Invalid component, target, schema or record ID | Rejected/safe fallback; no fabricated data or map pins |
| Update then delete/clear | Existing native UI returns |
| Overlapping requests A → B | No stale A result replaces B |
| Refresh / thread switch | Correct thread and current page context, no orphan UI |
| 390px / keyboard / focus | No body overflow, inaccessible controls or unexpected scrolling |
| Render error / Stop / Retry | Visible error/fallback and recoverable user journey |

Trace errors in **CopilotKit Inspector → Generative UI → Surfaces → Rejected operations**, then inspect the Catalog, Prompt and AG-UI Events if necessary. Verify one real browser model → `render_ui` → DOM round trip when implementing the page. For documentation-only edits, validate routing/contract tests without falsely claiming this live feature is implemented.

## 5. Official source and evidence

- https://docs.copilotkit.ai/generative-ui/components/surfaces → **ADAPT** target, `components`, `fallback`, `autoScroll` and error boundary → existing rental/event browse page → **VERIFY:** fallback/generate/update/clear and real user state.
- https://docs.copilotkit.ai/generative-ui/components/catalogs → **REFERENCE ONLY** allowable component names and schemas → existing `mdeUI` → **VERIFY:** name/schema rejection, not a new catalog.
- https://playwright.dev/docs/writing-tests → **ADAPT** focused mobile/browser journeys to existing MDE `e2e/` suites → **VERIFY:** map/result synchronization, thread refresh, guest isolation and screenshots without private data.
