---
name: maps
description: >-
  Use when MDE work changes or diagnoses Google Maps, Places, map state, markers, routes, location search, Maps grounding, or map-related keys.
title: maps — Google Maps Platform (comprehensive)
impact: HIGH
impactDescription: Places enrichment, Maps grounding, ChatMap, batch APIs, security, AI code assist
tags: google-maps, places-api, maps-links, gemini-grounding, mdeai, mastra, security, cli, mcp
paths:
  - "src/**/*Map*"
  - "src/**/*map*"
  - "src/mastra/tools/*place*"
  - "supabase/functions/*maps*/**"
  - "supabase/functions/*places*/**"
---

# maps — Google Maps Platform

## When NOT to use

- Generic GIS / spatial math with no Google Maps Platform APIs
- **Mapbox-only** or **Leaflet/OpenStreetMap-only** stacks (no GMP)
- Unrelated mapping tutorials or homework off the mdeai repo
- **Non-mdeAI** products—still read-only here; prefer not to expand scope in this skill

## Load order (keep context small)

1. This **`SKILL.md`** — Quick routing table + Consolidated sibling note.
2. **GMP doc questions** — read the pinned official Google Maps skill first, then one MDE reference relevant to the task.
3. **One** MDE `references/*.md` file for implementation; do not bulk-load unrelated references.
4. **`scripts/gmaps.py` + `references/gmaps-cli-behavior.md`** only when running or editing batch CLI work.

Verify current Maps tooling before relying on an MCP integration.

---

## Official Google Maps upstream + MDE overlay

**Decision:** Google’s official `google-maps-platform` skill is the pinned upstream/reference layer. This `maps` skill remains the only active MDE Maps skill. Do not install a second active top-level Maps skill in this repo.

- Official docs: https://developers.google.com/maps/ai/agent-skills
- Official source: https://github.com/googlemaps/agent-skills
- Pinned reviewed copy: [`references/vendor/google-maps-platform/SKILL.md`](references/vendor/google-maps-platform/SKILL.md)
- Reviewed upstream commit: `84f0e9a2527403a408a61b8705bea0c3900b76a8`

For Google Maps API/SDK implementation, read the pinned official skill first, then apply the MDE rules here. For changing facts such as API availability, deprecations, pricing, and regional coverage, verify current official Google documentation or Code Assist rather than historical MDE notes.

MDE-specific ownership remains: Supabase owns inventory truth; Mastra owns orchestration; Maps/Places own geo truth; Gemini must not invent coordinates, place IDs, hours, or routes.

## PR review contract

### Source of truth

Changed map/place code and tests → this canonical skill → current Google Maps documentation / Code Assist → actual provider responses or stored grounded records.

### Review invariants

- Keep server-only Places/grounding credentials out of client bundles; restrict browser keys.
- Use the smallest required Places API (New) field mask for the exact endpoint.
- Do not invent or transform ungrounded place IDs, coordinates, URLs, hours, ratings, prices, availability, or business facts into provider truth.
- Preserve `mapId` where AdvancedMarker requires it.
- Reuse safe cached grounded results and stable provider/database IDs across map/list/chat state.
- Verify API/version claims against current Google Maps documentation.
- For a field-mask or billable-call defect, include the request path, smallest fix, and targeted proof of required fields without unnecessary requests.

---

## Quick routing

| Task | Go to |
|------|-------|
| **PRD / audit** — Places API (New) v2.1 feature matrix + score (PLACES-002–081) | Repo: `tasks/maps/maps-prd-v2.md`, `tasks/maps/places-api-new-audit.md` |
| **Interactive** — search_places, get_directions, show_on_map in Claude session | [§ Interactive MCP tools below](#interactive-mcp-tools) |
| **CLI batch** — use the maintained batch helper and behavior notes | [`scripts/gmaps.py`](scripts/gmaps.py) + [`references/gmaps-cli-behavior.md`](references/gmaps-cli-behavior.md) |
| **Security** — API key architecture, HTML pages, embed iframes | [`references/security-and-optimization.md`](references/security-and-optimization.md) |
| **Former `google-maps` skill** — removed 2026-05-14 (last stub copy in `_archive/2026-05-14/google-maps-stub/`) | § [Interactive MCP tools](#interactive-mcp-tools) below |
| **Former `react-google-maps` skill** — `@vis.gl/react-google-maps` | [`references/react-vis-gl/README.md`](references/react-vis-gl/README.md) |

## mdeAI environment

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — Frontend (browser) — Maps JS API, AdvancedMarkerElement
GOOGLE_PLACES_API_KEY       — Server-side only — Places API (New), enrichment scripts
GOOGLE_MAPS_API_KEY         — Edge functions — Directions, Routes
GOOGLE_ROUTES_API_KEY       — Edge functions — Routes API
```

**Medellín anchor:** `{ latitude: 6.2442, longitude: -75.5812 }` — default `locationBias` center and Maps grounding `latLng`.

**Never expose `GOOGLE_PLACES_API_KEY` through a `NEXT_PUBLIC_*` variable** — it is server-side only.

---

## Interactive MCP tools

Use these when answering location questions **in a Claude session** (not for mdeAI production code). Tools call Google Maps APIs live.

### Tools available

```
search_places(query, location?, radius?, type?, open_now?, language?)
  query     — text query ("restaurants in Laureles")
  location  — "lat,lng" center (optional)
  radius    — meters, max 50000 (optional)
  type      — place type filter ("restaurant", "tourist_attraction", "hotel")
  open_now  — boolean, default false
  language  — language code, default "en"

search_nearby_places(location, radius, keyword?, type?, rank_by?, open_now?, language?)
  location  — "lat,lng" (required)
  radius    — meters (required, max 50000)
  rank_by   — "prominence" (default) or "distance"

get_place_details(place_id, language?, reviews_sort?)
  place_id  — from search results
  reviews_sort — "most_relevant" (default) or "newest"

get_directions(origin, destination, mode?, alternatives?, avoid?, language?)
  mode      — "driving" (default), "walking", "bicycling", "transit"
  avoid     — "tolls", "highways", or "ferries"

geocode_address(address, language?, region?)
  region    — country code for regional bias

reverse_geocode(latlng, language?)
  latlng    — "lat,lng"

show_on_map(map_type, markers?, directions?, center?, zoom?)
  map_type  — "markers", "directions", or "area"
  markers   — array of {lat, lng} objects
```

### Response pattern — Text → Map → Text

**Always follow this sequence. Never call `show_on_map` in parallel with other calls.**

1. **Text** — introduce what you'll show ("Here are top restaurants near Poblado:")
2. **Map** — call `show_on_map` to render results
3. **Text** — explain results in plain language (names, ratings, notes)

**Multiple categories:** sequential maps — events then restaurants, not parallel.

**Never echo raw map_data JSON** (coordinates, markers, zoom) in your text response. The map renders visually; describe places by name and quality only.

### Intent → tool mapping

| User says | Tool to use |
|-----------|-------------|
| "Where is X?" | `geocode_address` |
| "Find restaurants near..." | `search_places` or `search_nearby_places` |
| "What are the hours for...?" | `get_place_details` |
| "How do I get from A to B?" | `get_directions` |
| "What address is at these coords?" | `reverse_geocode` |
| "Show me these places on a map" | `show_on_map` |

**Preserve `place_id`** from search results for use in `get_place_details`.

---

## Places API (New) — field masks for mdeAI

Every request uses `X-Goog-FieldMask` header. Only request fields you need — billing is field-mask driven.

### Enrichment mask (PLACES-005-010)

```
places.id,places.displayName,places.googleMapsLinks,places.location,places.generativeSummary
```

| Field | Returns | mdeAI use |
|-------|---------|-----------|
| `places.id` | Place ID (`ChIJ...`) | Store as `place_id` |
| `places.googleMapsLinks.placeUri` | Canonical `https://maps.app.goo.gl/...` URL | Store as `maps_url` |
| `places.googleMapsLinks.directionsUri` | Directions link | Optional card button |
| `places.googleMapsLinks.photosUri` | Google Maps photos link | Optional "see photos" |
| `places.location` | `{ latitude, longitude }` | Backfill lat/lng |
| `places.generativeSummary` | `{ text, disclosureText }` | Store as `ai_summary`; show `disclosureText` |

### generativeSummary constraints

- **Coverage:** English only; US and India only currently
- **Attribution required:** Display `disclosureText` ("Summarized with Gemini") wherever `ai_summary` appears — ToS requirement
- **Cache in DB:** Fetch once at seeding time. Never call per chat turn.

### googleMapsLinks — currently free

`googleMapsLinks` is in preview and **free** as of 2026-05. Use `placeUri` (not lat/lng-constructed URLs) — it's stable and canonical.

---

## Node.js client — enrichment script pattern

```typescript
import { PlacesClient } from '@googlemaps/places';

const client = new PlacesClient({ apiKey: process.env.GOOGLE_PLACES_API_KEY });

const [response] = await client.searchText(
  {
    textQuery: `${venueName} ${neighborhood} Medellín Colombia`,
    locationBias: {
      circle: { center: { latitude: 6.2442, longitude: -75.5812 }, radius: 30000 },
    },
  },
  { otherArgs: { headers: { 'X-Goog-FieldMask': 'places.id,places.displayName,places.googleMapsLinks,places.location,places.generativeSummary' } } },
);
```

---

## Gemini Maps grounding — summary

Use current official Google Maps grounding documentation; do not rely on retired offline mirrors.

| Mode | Free tier | Cost | Enable |
|------|-----------|------|--------|
| Grounding with Google Maps (Gemini API) | 500/day | $25/1K | `tools: [{ googleMaps: {} }]` |
| Maps Grounding Lite (MCP) — **GA** | pay-as-you-go | per SKU | `mapstools.googleapis.com/mcp` |

**Kill switch:** `MAPS_GROUNDING_DAILY_LIMIT=0` → fall back to Supabase immediately.

**Sequential calls for structured output:** grounded call (no `responseMimeType`) → structured output call (no grounding). Maps + custom function declarations CAN be combined in one call (March 2026 update).

---

## Maps JavaScript API — ChatMap.tsx summary

Use [`references/react-vis-gl/README.md`](references/react-vis-gl/README.md) plus current app source for Maps JavaScript implementation.

- Loader: `@googlemaps/js-api-loader` with `libraries: ['marker']`
- `mapId` required for `AdvancedMarkerElement`
- `data-testid="map-pin"` on every pin content element (MASTRA-045 smoke spec)
- Per-category pin merge: `setPins(prev => [...prev.filter(p => p.category !== cat), ...newPins])`
- Frontend key restricted to HTTP referrers + Maps JS API only

---

## Session tokens — autocomplete billing

Use UUID v4 session tokens to group autocomplete keystrokes + final Place Details into one billing event:

```typescript
import { v4 as uuidv4 } from 'uuid';
const sessionToken = uuidv4(); // new UUID per search session
// Pass as sessionToken on each Autocomplete call
// Generate fresh UUID after user selects a place
```

---

## GCP key setup — quick reference

| Key | Restrictions | APIs enabled |
|-----|-------------|-------------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | HTTP referrers for approved MDE origins | Maps JavaScript API only |
| `GOOGLE_PLACES_API_KEY` | Server IP | Places API (New) only |
| `GOOGLE_MAPS_API_KEY` | Server IP | Directions API, Maps Static |
| `GOOGLE_ROUTES_API_KEY` | Server IP | Routes API |

> Full 2-key security architecture → [`references/security-and-optimization.md`](references/security-and-optimization.md)

**Enable "Places API (New)"** in GCP Console — NOT "Places API" (legacy). Different billing, different endpoints, different field names.

---

## Event discovery — Maps / Places / ADK (plan 10 §11)

| Layer | mdeai use | Skill / task |
|-------|-----------|----------------|
| **Places API (New)** | Batch venue enrich → `place_id`, `maps_url`, lat/lng | **EVD-06** → EVP-024 (historical) |
| **Maps JS** | Camila’s event pins (`mapId` + `AdvancedMarker`) | EVP-016 (historical) |
| **ADK sidecar** | Freshness / `search_grounded_places` — not event inventory | EVP-023 (historical) |
| **Web grounding** | C-004 citations — Google Search, not Places catalog | EVP-021 (historical) |

Historical event-discovery task links were retired; resolve current work through Linear and the canonical `events` skill.

**Golden rule:** Places enriches DB once; grounding answers live geo questions — never invent event listings from Maps.

---

## Mastra handoff

For Maps-related Mastra work, use the canonical `mastra` skill plus current source and the live Linear task. Retired `tasks/mastra/maps/**` paths are not active instructions.

---

## Common gotchas

| Gotcha | Fix |
|--------|-----|
| `generativeSummary` null | Handle gracefully — not all places have summaries |
| No `disclosureText` shown | Required by ToS — show "Summarized with Gemini" |
| Legacy Places API | Switch to Places API (New) — different billing, different endpoints |
| `googleMapsLinks` missing | Must be in field mask explicitly |
| Constructing Maps URLs from lat/lng | Use `placeUri` from `googleMapsLinks` — it's canonical and stable |
| `AdvancedMarkerElement` not found | Add `'marker'` to `libraries` in js-api-loader |
| Missing `mapId` | Required for AdvancedMarkerElement — set in Map constructor |
| Frontend key 403 | Verify HTTP referrer restriction includes current origin |
| Places server key in `NEXT_PUBLIC_*` | Server-side keys must never be browser-exposed |
