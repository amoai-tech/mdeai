# SAN-465 — real Google Routes distance/duration (2026-11-08)

## Provider verification

- `routes.googleapis.com` already enabled on `mdeai-506221`.
- The existing server-only key `GOOGLE_MAPS_SERVER_API_KEY` was restricted to Places; Routes returned
  `403 API_KEY_SERVICE_BLOCKED`. Added `routes.googleapis.com` to the same key's API targets; key
  remains server-only.
- Direct `computeRoutes` probe: Laureles → Provenza, WALK → **200**, `distanceMeters=5090`,
  `duration="4506s"`, encoded polyline present.

## Implementation

- `src/mastra/lib/google-routes-client.ts`: typed waypoints (lat/lng, placeId, address), travel mode,
  field mask `routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline`, 10 s timeout,
  strict duration/units parsing, null on empty, typed provider error.
- `src/mastra/tools/compute-route.ts`: one Mastra tool; returns `route` + `source:"google_routes"`,
  or `route:null, reason:"route_unavailable"`.
- Registered in the existing concierge tools with an explicit “never estimate” instruction.
- No new agent, sidecar, MCP connection, table or dependency.

## Live tool proof

`computeRouteTool.execute` (real key) → `distanceMeters 5090`, `durationSeconds 4506`,
`travelMode WALK`, polyline, `attribution Google Maps`.

## Tests

- Client: 5 pass (parse, empty/malformed, real request, invalid coordinates, 403).
- Tool: 2 pass (real route, empty → unavailable).
