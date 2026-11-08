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

## Review hardening

- Routes key resolver: `GOOGLE_ROUTES_API_KEY` → Routes-enabled `GOOGLE_MAPS_SERVER_API_KEY`;
  **no Places-only key fallback**. Missing key returns unavailable without consuming a quota slot.
- All transport/timeout/JSON/key errors normalized into `RoutesRequestError`; the tool logs and
  returns `route_unavailable`.
- Local invalid waypoints return `invalid_route_request` before quota/provider calls.
- Existing daily quota reservation runs before each paid route request.
- Polyline is requested/returned only when `includePolyline` is true.
- Null route entries are rejected.
- Mastra execution context is passed to `runAuditedTool` for tool-span telemetry.
- Live re-test after hardening: 5,090 m / 4,506 s WALK, polyline, Google attribution.

**Reproducibility note:** adding `routes.googleapis.com` to the existing server key was a GCP
configuration change, not code. Environments can instead set `GOOGLE_ROUTES_API_KEY`; the client
prefers it. No secret is committed. A Terraform/managed key policy is still a follow-up.

## Separate Routes budget

Route calls no longer consume the café/nightlife Places quota. They reserve through the existing
atomic `check_rate_limit` RPC with key `routes-daily:<UTC date>`, window 86,400 s and cap
`ROUTES_DAILY_LIMIT` (default 100). Missing/failed store fails closed; exceeding the cap returns
`route_quota_exceeded`. No new table; the existing shared limiter RPC has a corrective migration
`20261108110529_san465_keep_active_daily_rate_limits.sql` with a rolled-back pgTAP regression.

## Additional review hardening — retain daily quotas and avoid misleading routes

- Read-only live SQL confirmed `public.check_rate_limit` performed 1% random deletion of
  counter rows older than **one hour**. A live daily Routes bucket starts at midnight UTC,
  so other callers could delete an active daily bucket after 01:00 UTC and reset the paid-call
  budget. The **canonical function** is changed in an imperative versioned migration to retain
  rows **48 hours** (all verified MDE callers have windows up to 24h). RLS, server-only execute
  grants and atomic ON CONFLICT increment are retained. No duplicate limiter.
- Added local pgTAP regression `supabase/tests/database/san465_rate_limit_daily_retention_test.sql`
  asserting cleanup retention, grants, and cap behavior. The local Supabase DB container is
  **not running**; this test has **not** yet executed. Apply/verify through the normal DB
  migration gate before calling the fix live. Until then the live RPC remains vulnerable.
- Protobuf JSON duration permits fractional seconds (example `4506.500s`); parser
  accepts up to 9 decimals and keeps true provider duration.
- Reject a Places-only API key instead of making a doomed Routes request; preserve Routes
  key precedence. Missing key does not consume quota. Quota RPC thrown transport errors fail
  closed, and malformed daily limits such as `100garbage` cannot bypass configuration.
- Google Routes WALK/BICYCLE responses carry the required safety caution; the existing
  concierge is instructed to communicate it. SAN-229's CommuteCard must display the caution
  deterministically when it renders those routes.
- **Focused after fixes:** 15/15 Routes tests passed.
- **Repository verification:** lint PASS, TypeScript PASS; full Vitest 5,376 PASS,
  49 skipped. CI/Floor require a new pass for the corrected PR head.
- **Current release scope:** backend only, SAN-229 owns CommuteCard/polyline/map.
  No A2UI/OpenBot/OpenMuse/OpenDot runtime or extra ADK/MCP server needed.
- **Sources:** https://developers.google.com/maps/documentation/routes/compute_route_directions
  (request/response field masks), https://protobuf.dev/programming-guides/json/
  (fractional Duration), https://developers.google.com/maps/documentation/routes/route-travel-modes
  (walking/bicycling cautions), https://developers.google.com/maps/documentation/routes/get-api-key
  (Routes-only key restrictions), https://supabase.com/docs/guides/database/functions
  (SECURITY DEFINER and function execution permissions).
