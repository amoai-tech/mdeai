# SAN-465 — force compute-route for travel questions (2026-11-08)

Production `d537700f` answered “walk from Parque Lleras to Provenza” with an estimated 2.3 km/30 min
while `ai_runs.metadata.tool_count` was 0 and no `compute-route` span existed.

## Fix

- New `route-tool-choice.ts`: detects English/Spanish route questions and returns true only on the
  first model step before the route tool has run.
- Concierge adds the existing `processInputStep` processor pattern:
  `toolChoice: { type: "tool", toolName: "computeRouteTool" }`.
- The existing `compute-route` tool then returns Google distance/duration/polyline or
  `route_unavailable`; no new agent, tool, key or table.
- Tests: 4 route-choice tests pass (English, Spanish, café query excluded, no force after tool).

Expected production proof: a route question gets a `compute-route` span in `ai_runs`, with Google
distance/duration; no model-estimated ETA.

## Review tightening

- Route detection now requires a travel term **and two place-like endpoints** (from/to, de/a,
  between/and, entre/y). Rental price ranges, “walking distance to the Metro”, booking time windows,
  one-endpoint questions and generic “the apartment” origins are rejected.
- Spanish and between/entre endpoint forms are accepted.
- Two-place `show me the walk from X to Y` remains a route request.
- Routes tool adds a per-user daily cap (`ROUTES_DAILY_LIMIT_PER_USER`, default 20) on top of the
  shared 100/day cap; both use atomic `check_rate_limit`.
- Tests: 17 route-intent cases + tool tests pass.

Known remaining: a retry of the same route turn can reserve again; short mode/duration follow-ups
without endpoints are not forced. These require request-context reuse and are documented.

## Second review pass

- Per-user cap is checked **before** the shared daily slot, so an over-cap user cannot drain the
  shared 100/day budget.
- Endpoint parser rejects travel-mode fragments (`a pie`), verb-led destinations (`meet friends`,
  `eat`, `see`) and possessive/generic origins (`my hotel`, `my apartment`).
- Negative tests now include rental price ranges, walking-distance listings, booking time windows,
  one-endpoint questions, café discovery and generic/possessive origins.
- 17 route-intent cases + 8 tool tests pass.

## Final review pass

- A short mode-only follow-up (“And by car?”, “¿Y en bici?”) directly after a real route question
  forces the tool. Ordinary later messages (“What about cafés…”, “Find apartments within walking
  distance…”) do not.
- Tool result cache on the shared RequestContext avoids duplicate calls **within the same agent run**.
  It does **not** persist across a new HTTP/agent run; retry deduplication remains unverified and is
  not claimed.
- Prompt now explicitly says a null route must be reported as unavailable with no estimate/substitute.
- 25 route-intent tests + 8 tool tests pass.
