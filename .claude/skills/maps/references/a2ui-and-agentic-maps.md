# Agentic maps: A2UI, Google Maps toolkit, and CopilotKit

Last reviewed: 2026-11-10. **Reference and integration decision, not an installation guide.** Check current official docs and installed SDK types before implementing; Google's Maps Agentic UI toolkit is experimental and may change.

## MDE decision

**Use MDE's existing Google Maps for real application maps, existing grounded MDE cards and native controls for currently available choices/saves, and Mastra + Supabase for lookup and authorized writes.** CopilotKit v2 supports AI-generated read-only content now, but standard `Button`, `ChoicePicker`, `DateTimeInput` and other interactive inputs are intentionally omitted from the MDE catalog. **Do not present those controls as working until SAN-1655/SAN-1658 register authorized functions and corresponding catalog tests.** Evaluate protocol A2UI only if a real interoperability requirement arises. Do not install a second map renderer, agent runtime, or trip writer just to reproduce a demo.

| System | What it does | Use in MDE | Boundary |
| --- | --- | --- | --- |
| **A2UI (Agent-to-User Interface)** | A structured, cross-platform protocol for agents to describe UI components and updates; the client renders them | Reference for a future cross-agent/cross-renderer interchange need | A protocol, **not** an API for truth, authorization, or maps routing |
| **Google Maps Agentic UI toolkit** (`googlemaps/a2ui`) | Experimental Google Maps/Places-oriented agent UI components and handlers | Learn patterns for inline maps, place details, and agent-produced visual responses | Its sample Python ADK/A2A agent and Lit web renderer are **not** MDE dependencies |
| **CopilotKit Generative UI / `standardUI`** | MDE's existing React v2 catalog, Surfaces, state bindings and function registration APIs | **Now:** grounded cards/read-only previews. **Later:** ChoicePicker, Confirm/Cancel and editable schedules only after SAN-1655/SAN-1658 wire real functions and test them | Interactive controls are currently omitted; `standardUI` Map uses optional MapLibre, and its `route` is **not** a computed road route |
| **MDE Google Maps** (`@vis.gl/react-google-maps`) | Existing Maps JS canvas, `AdvancedMarker`, map/pin selection and details | Canonical discovery and Trips map, responsive interaction, map failures and attribution | One browser map provider; Google Routes owns actual road geometry and ETA |

These are **different integration layers**, not interchangeable implementations. The A2UI protocol and Google's Maps Agentic UI toolkit are distinct from CopilotKit's MDE catalog, even though CopilotKit's standard catalog incorporates A2UI basic components.

## Which approach to choose

| User journey | Recommended implementation | Proof |
| --- | --- | --- |
| "Open my trip map" | Existing `MapsShell`, `Map`, `AdvancedMarker` and saved trip items | Real pins/IDs, selection sync, 390px, honest unavailable state |
| "Show three cafés near my rental" | **Now:** existing Mastra search and grounded MDE cards. **Future:** CopilotKit ChoicePicker only after SAN-1655/SAN-1658 register handlers and tests | Only source-backed options with stable IDs, correct attribution |
| "Add the selected café to Saturday" | **Now:** use the native `AddToTripButton`/trip picker and existing `addTripItem` → `insert_trip_item_for_user` RPC. **Future:** an AI preview/Confirm only after registered CopilotKit functions and catalog tests exist | Native Confirm saves once and Cancel writes zero; the future AI flow must prove the same |
| "Display the route between trip stops" | Existing Google Routes client with verified waypoints, legs and encoded polyline | True road geometry and provider ETA, or "Route unavailable" |
| "Send the same generated map UI to other agents/platforms" | Investigate A2UI transport and renderer compatibility in an isolated proof of concept | Demonstrated protocol contract, no duplicate production runtime |

### Code ownership / reuse

- **Google Maps loading and status:** `src/components/maps/MapProvider.tsx` (`MapsShell`). Preserve the failure mode where chat/itinerary stays mounted.
- **Trip markers and selection:** `src/components/trips/trip-map-panel.tsx` and `src/components/trips/trip-workspace-view.tsx`. Use saved UUIDs and real coordinates; do not let the model choose pins from unverified text.
- **Discovery map, overlays and cards:** existing Maps/browse components; compose or reuse their props rather than cloning another map.
- **CopilotKit catalog:** `src/components/copilot/a2ui/mde-ui-catalog.tsx`. `MDE_OMITTED_STANDARD_COMPONENTS` deliberately excludes standard `Map`, `Button`, `ChoicePicker`, `DateTimeInput` and other inputs. **Do not enable interactive controls until SAN-1655/SAN-1658 add registered functions and matching tests in `src/components/copilot/a2ui/__tests__/mde-ui-catalog.test.ts`** (verify path and current test owner when implementing). Until then use existing grounded cards and native buttons/confirmation, not inert generated controls. See `.claude/skills/copilotkit/references/standard-catalog.md`.
- **MapLibre boundary:** `src/lib/a2ui/maplibre-stub.ts`. Do not remove the stub or install `maplibre-gl` merely to turn on standard `Map`.
- **Authorized save:** `src/app/trips/actions.ts`, `src/lib/trips/resolve-trip-source.ts`, and the existing Supabase RPC. Place IDs are text; `trip_items.source_id` is a real internal UUID.
- **Actual routing:** existing `src/mastra/lib/google-routes-client.ts`; never infer driving/walking routes from a polyline drawn between marker coordinates.

## Reusable design ideas (adapt, do not copy a runtime)

**Present behavior vs future work:** Ideas 3–4 below are **not enabled in the current MDE standard catalog**. Keep the current grounded-card + native trip-picker/confirmation path until SAN-1655/SAN-1658 provide real function handlers and regression tests; a rendered but inert AI button is a defect, not an implementation.

1. **Inline map result:** An AI response can accompany an existing MDE map with real selected place cards. Selection must share the *same* stable place/item ID with the list and Details.
2. **Place card:** Show name, source and location from the authorized catalog; indicate unknown details instead of fabricating them. Keep existing provider credits and links.
3. **Guided choice (future):** After SAN-1655/SAN-1658 provide and test registered handlers, a CopilotKit `ChoicePicker` could select among three grounded cafés; `Button` could invoke an authorized action. Today, reuse existing grounded MDE cards and native actions.
4. **Trip-change preview (future):** User asks "Add this café on Saturday" → agent proposes a real place → user edits a trip-local date/time → explicit Confirm calls the existing server action. This requires registered handlers, tests and a trip-local time-zone contract; until implemented, use the native Add-to-trip dialog. Cancel must never write.
5. **Route preview:** Fetch Google Routes legs/polyline from the existing server tool and overlay on the existing Google Map. If API lacks a route, say so; do not draw a straight line and call it a road.

For a CopilotKit-controlled inline Google map, prefer a **small typed MDE custom catalog component** backed by existing map state and verified IDs. Do **not** expose a second map provider, use `standardUI.Map` as a shortcut, or implement an A2UI/A2A transport bridge unless a documented product requirement makes interoperability necessary.

## Do not import from Google samples

Do **not** copy the example Python ADK/A2A agent, its separate A2A server, the Lit UI renderer, an extra Google Maps provider, additional agent orchestration, or a parallel database/write workflow. The official samples demonstrate an alternative end-to-end stack, not a mandatory integration for MDE's Next.js + CopilotKit + Mastra application.

## Correctness and acceptance checklist

- **Grounding:** Coordinates must be finite, in range, and linked to source-backed listing/place records; never invent Google Place IDs, availability, prices or ETA.
- **Identity:** Resolve provider Place ID → real internal UUID before saving. Preserve source provenance, stable IDs, and selection across card, map, AI and Details.
- **Attribution and terms:** Preserve Google Maps tiles, required provider attribution/disclosures, current Places field-mask requirements and permitted storage. Verify changing terms at time of implementation.
- **User choice:** Standard generated Button, ChoicePicker and inputs **remain omitted until SAN-1655/SAN-1658 register their functions and add matching `src/components/copilot/a2ui/__tests__/mde-ui-catalog.test.ts` coverage**. Never expose inert controls. Once enabled, bind actions to authorized handlers; Confirm saves, Cancel does nothing, and user edits survive later AI updates. For now, use native action and confirmation controls.
- **Security:** Server-side authentication, authorization, RLS and RPC checks stay canonical; reject forged source IDs, cross-user trip writes and unknown external places.
- **Routing:** Show only provider-computed Routes distance/duration/polyline; differentiate route unavailable from missing coordinates.
- **UI reliability:** Real browser tests at desktop and 390px, map-key/network failure fallback, map↔card selection, correct Details, refresh, rejected writes and idempotent retries.
- **Verification:** Inspect exact installed SDK types and the current documentation. Focused tests first; do not claim a production journey passed from a mock MapLibre/list fallback or a demo.

## Official and canonical references

| Source | Use | How to apply |
| --- | --- | --- |
| [Google A2UI announcement](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) | **REFERENCE ONLY**: background on structured agent-sent UI and renderer ownership | Consider only for a demonstrated cross-agent need; no new integration from this article alone |
| [Google Maps Agentic UI toolkit docs](https://developers.google.com/maps/ai/agentic-ui-toolkit) | **REFERENCE ONLY**: current status, scope and Google requirements | Recheck experimental stage, services, attribution and charges at implementation time |
| [Google Maps Agentic UI implementation](https://github.com/googlemaps/a2ui) | **MODEL patterns**: map/place presentation and agent-driven UI | Translate patterns to MDE's existing React Google Maps components only |
| [Google Maps Agentic UI samples](https://github.com/googlemaps-samples/a2ui) | **REFERENCE ONLY**: example React web client and Python ADK/A2A flow | Avoid importing its runtime/renderer; adapt UX ideas if useful |
| [CopilotKit standard catalog](https://docs.copilotkit.ai/generative-ui/components/standard-catalog) | **ADAPT**: typed components, narrow catalogs and registered actions | `mde-ui-catalog.tsx`; verify installed v2 exports and the advertised catalog |
| [CopilotKit standard Map](https://docs.copilotkit.ai/generative-ui/components/standard-catalog/map) | **REFERENCE ONLY**: markers, bound selection and `route` behavior | Keep excluded for now; `route` draws connecting lines and is not Google Routes |
| [React Google Maps](https://visgl.github.io/react-google-maps/) | **ADAPT**: canonical React Google Maps API and current component patterns | Continue existing `MapsShell` and `AdvancedMarker` integration; verify installed-version APIs |

**Reevaluation trigger:** Revisit Google A2UI or CopilotKit standard `Map` only when a specific feature needs interoperable agent UI beyond existing CopilotKit/Google Maps, the SDK contract is validated, and measured benefits outweigh an additional renderer/runtime.
