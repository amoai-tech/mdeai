---
name: maps
description: >-
  Use whenever MDE work implements, changes, reviews, or diagnoses Google Maps Platform: Maps JavaScript, Places, markers, routes/ETA, location search, geocoding, Maps grounding, map state, API keys, attribution, or Maps-related cost/security. Do not use for generic GIS or Mapbox/Leaflet/OpenStreetMap-only work with no Google Maps Platform dependency.
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

## Load order (keep context small)

1. This **`SKILL.md`** — Quick routing table + Consolidated sibling note.
2. **GMP doc questions** — read the pinned official Google Maps skill first, then one MDE reference relevant to the task.
3. Use [`references/reference-index.md`](references/reference-index.md) to choose one authoritative source; then load only the MDE reference needed.
4. **`scripts/gmaps.py` + `references/gmaps-cli-behavior.md`** only for batch CLI work.

Verify current Maps tooling before relying on an MCP integration.

---

## Official Google Maps upstream + MDE overlay

**Decision:** Google’s official `google-maps-platform` skill is the pinned upstream/reference layer. This `maps` skill remains the only active MDE Maps skill. Do not install a second active top-level Maps skill in this repo.

- Official docs: https://developers.google.com/maps/ai/agent-skills
- Official source: https://github.com/googlemaps/agent-skills
- Pinned reviewed copy: [`references/vendor/google-maps-platform/SKILL.md`](references/vendor/google-maps-platform/SKILL.md)
- Reviewed upstream commit: `6606930272e554171b42d69312674cbe40aa819c`

## Current Google guidance workflow

For non-trivial implementation, migration, bug fix, review, or API/version claim:
1. Read this MDE skill for repo architecture.
2. Retrieve Google’s current Maps Platform skills index and load only the matching product sub-skill.
3. Use Maps Platform Code Assist/current official docs only when the sub-skill does not fully cover the task.
4. Apply MDE Supabase, Mastra, security, UI, and testing constraints.
5. Run the PR/compliance checks below before completion.

Do not implement changing APIs, pricing, coverage, deprecations, quotas, or billing behavior from model memory. MDE ownership remains: Supabase = inventory truth; Mastra = orchestration; Maps/Places = geo truth.

## Source precedence and freshness

Use [`references/reference-index.md`](references/reference-index.md). Priority is: current Google implementation docs/canonical library docs → current Google architecture/AI docs → Google product pages/blogs → community/third-party sources. Search results and third-party skills are discovery only. For pricing, quotas, regional coverage, product status, deprecations, AI availability, or field availability, fetch a current official source before deciding.

For Code Assist, prefer the Google-hosted remote MCP endpoint `https://mapscodeassist.googleapis.com/mcp`; do not add the deprecated local npm Code Assist package.

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

## Product-selection routing matrix

Choose the modern product before coding, then verify the matching current Google sub-skill.

| Need | Default product direction |
|---|---|
| React map + markers | Maps JavaScript API via `@vis.gl/react-google-maps` + Advanced Markers |
| Place search/details/autocomplete | Places API (New) / current Place APIs |
| Routes, ETA, route matrix | Routes API / current Route APIs |
| Address validation/standardization | Address Validation API |
| Address ↔ coordinates | Geocoding API |
| Static map / Street View image | Maps Static API / Street View Static API |
| Air quality, pollen, solar, weather | Load the current matching environmental sub-skill |

Do not select a product from memory when current Google guidance is available.

---

## Quick routing

| Task | Go to |
|------|-------|
| **CLI batch** — use the maintained batch helper and behavior notes | [`scripts/gmaps.py`](scripts/gmaps.py) + [`references/gmaps-cli-behavior.md`](references/gmaps-cli-behavior.md) |
| **Security** — API key architecture, HTML pages, embed iframes | [`references/security-and-optimization.md`](references/security-and-optimization.md) |
| **Source selection / current docs** | [`references/reference-index.md`](references/reference-index.md) |

## mdeAI environment

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — Frontend (browser) — Maps JS API; add Places API (New) for browser Places New search/autocomplete
GOOGLE_PLACES_API_KEY       — Server-side only — Places API (New), enrichment scripts
GOOGLE_MAPS_API_KEY         — Server-side Maps APIs explicitly required by the feature
GOOGLE_ROUTES_API_KEY       — Edge functions — Routes API
```

**Medellín anchor:** `{ latitude: 6.2442, longitude: -75.5812 }` — default `locationBias` center and Maps grounding `latLng`.

**Never expose `GOOGLE_PLACES_API_KEY` through a `NEXT_PUBLIC_*` variable** — it is server-side only.

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
| `places.generativeSummary` | provider summary + disclosure | Use only with a model/schema that preserves provider provenance and disclosure; never collapse into generic MDE `ai_summary` |

### Volatile provider facts

Pricing, free tiers, geographic availability, preview/GA status, field availability, and quotas are volatile. Always verify them against current Google Maps Platform documentation before architecture, billing, or product decisions. Preserve required attribution/disclosure and cache only when current terms permit it.

---

## Server-side Places enrichment

Keep Places API (New) calls server-side with `GOOGLE_PLACES_API_KEY`; request only fields the feature needs. Verify current client syntax and field names in Google docs before implementation.

---

## Gemini Maps grounding — summary

Verify current grounding products, availability, quotas, pricing, and structured-output compatibility in official Google guidance before implementation. Keep `MAPS_GROUNDING_DAILY_LIMIT=0` as the MDE kill switch to fall back to Supabase.

---

## Maps JavaScript API — ChatMap.tsx summary

### React implementation rule

MDE React/Next.js Maps code uses `@vis.gl/react-google-maps`. Prefer `<APIProvider>`, `<Map>`, `useMapsLibrary()`, and Advanced Marker APIs. Do not introduce `google-map-react`, `@react-google-maps/api`, or another wrapper. Use `@googlemaps/js-api-loader` only for non-React utilities or an existing raw-JS boundary. See [`references/react-vis-gl/README.md`](references/react-vis-gl/README.md).

- Map containers need explicit height; Advanced Markers need the current required marker library and a valid `mapId`.
- International search/geocoding must consider explicit `language` and `region` rather than silently inheriting machine/IP locale.
- Keep `data-testid="map-pin"` on pins used by MDE smoke tests; keep frontend keys restricted to approved referrers + required browser APIs only.

---

## Session tokens — autocomplete billing

Use the current provider-recommended session-token mechanism for the API being called. In Maps JavaScript Place Autocomplete Data API, use `AutocompleteSessionToken`; for web-service flows, use a unique token per user autocomplete session. Start a fresh token after selection/termination and verify current billing semantics in official docs.

---

## Demo key policy

Demo Key: prototypes only. Production/shared environments use restricted project credentials for required APIs/origins. Never commit keys.

---

## GCP key setup — quick reference

| Key | Restrictions | APIs enabled |
|-----|-------------|-------------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | HTTP referrers for approved MDE origins | Maps JavaScript API; add Places API (New) when browser Places New search/autocomplete is used |
| `GOOGLE_PLACES_API_KEY` | Server IP | Places API (New) only |
| `GOOGLE_MAPS_API_KEY` | Server IP | Only explicitly required server Maps APIs (for example Maps Static) |
| `GOOGLE_ROUTES_API_KEY` | Server IP | Routes API |

> Full 2-key security architecture → [`references/security-and-optimization.md`](references/security-and-optimization.md)

**Enable "Places API (New)"** in GCP Console — NOT "Places API" (legacy). Different billing, different endpoints, different field names.

---

## MDE domain handoff

Maps/Places provides geo truth, not event/rental inventory. Keep inventory in Supabase, orchestration in Mastra, and route domain behavior through the owning `events` or `real-estate` skill. Never invent listings from Maps grounding.

---

## Legacy API hard failures

Do not introduce `google.maps.Marker`, legacy Places `Autocomplete`/`SearchBox`/`PlacesService`, legacy `DirectionsService`/`DirectionsRenderer`, `DistanceMatrixService`, `visualization.HeatmapLayer`, or `google.maps.drawing`. Retrieve current Google guidance and use the recommended modern replacement before editing these surfaces.

**Directions status override (verified 2026-09-22):** current Google Maps JavaScript reference documentation says `DirectionsService` and `DirectionsRenderer` are **deprecated as of February 25, 2026** and **not scheduled to be discontinued**. They may remain in existing integrations, but MDE must not introduce them in new code; use the current Routes library/API (`Route` / `RouteMatrix`) instead. If the pinned vendor skill says these services were disabled in March 2025, current implementation documentation wins:
- https://developers.google.com/maps/documentation/javascript/reference/directions
- https://developers.google.com/maps/documentation/javascript/routes/overview

## Critical failure checks

Before approval verify: no unsupported browser REST/CORS path; map container has explicit height; React uses `@vis.gl/react-google-maps` with the required marker library; Advanced Markers use a valid `mapId`; server keys stay out of client bundles; web-component objects are not stringified as HTML attributes; headless tests do not assume WebGL/3D; coordinates stay `{ lat, lng }`; international flows set intentional locale/region; Places field masks are minimal; no legacy API was introduced.

## Compliance review

For significant Maps changes verify provider-sourced geo/place data, required attribution, permitted storage/caching, no LLM-fabricated provider facts, correct browser/server key restrictions, intentional billable fields/calls, and applicable regional/EEA requirements against current Google terms.

## Google Places provider summaries

Google Places provider summaries are distinct from MDE `ai_summary`. Preserve provider provenance and disclosure end-to-end. Render provider summaries through `GooglePlacesSummary`; missing provider disclosure suppresses the summary. Do not relabel or store them as generic MDE `ai_summary`.


## Maps completion evidence gate

Do not call a Maps change complete until evidence covers: targeted Maps tests; no new legacy API; client/server key exposure; minimal field masks for changed Places calls; compliance/attribution review; and a browser smoke test when map UI changed. Record any current-doc or Code Assist source used for an API/version decision.

For upstream maintenance, run `node .claude/skills/maps/scripts/check-google-maps-upstream.mjs`; drift is a review signal, never an automatic overwrite.
