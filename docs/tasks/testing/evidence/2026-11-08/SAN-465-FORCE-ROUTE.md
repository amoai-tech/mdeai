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
