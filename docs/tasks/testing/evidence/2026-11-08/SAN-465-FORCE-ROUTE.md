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
