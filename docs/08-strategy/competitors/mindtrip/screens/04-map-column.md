# 04 — Map column

Evidence: own session (`own-captures/auth-26-followup-done.png`) and `1-rental-chat.png`.

## Layout

Full-height Google map filling the right column. Controls: collapse (top-left), search-this-area, filter (top-right), locate me and map type (bottom-right), weather chip (bottom-left), Google attribution.

## Content

- **Stay pins**: icon plus the place name beside it (V). Not price pills.
- Other categories (restaurants, sights) as coloured glyphs without labels.
- A city label pin ("El Poblado", "Medellín").
- Pins are Google Advanced Markers (`gmp-advanced-marker`), about 24 on one answer including non-stay pins (V).

## Behaviour

| Action | Result | Level |
| --- | --- | --- |
| Hover a card | Its pin's z-index rises (1 → 6) | V |
| Click a pin | Detail panel replaces the map; page address gains `?ref=ho-…&quoteRef=hq-…` | V |
| Click a pin | No ordinary HTTP request in a 25 s window; details came from already-loaded state | V (negative) |
| Follow-up question | Map re-centres and re-labels to the new answer | V |

## MDE today

- `ChatMap` (`src/components/maps/ChatMap.tsx`): category glyph pins with no labels, clustering (`shouldClusterMapPins`), `MapPinInfoWindow` + `SelectedPlaceOverlayCard` on select.
- Sync: `data-pin-id` on cards, `domain-results.tsx` and `search-tool-result-cards.tsx` `scrollIntoView` the selected card; `ToolPinsSync` merges pins per category; `MapUiSync` pushes pins, selection and viewport into agent state (Mindtrip's equivalent is unknown).
- Café and nightlife open an in-column detail (`data-right-column-mode="detail"`); rentals do not.
- Empty state card "Map is ready" until a search runs.

## Worth adapting

Name labels on rental pins (post-MVP, `CategoryMapMarker.tsx`, `map-pin-meta.ts`); open rental details in the right column (Fix 1).
