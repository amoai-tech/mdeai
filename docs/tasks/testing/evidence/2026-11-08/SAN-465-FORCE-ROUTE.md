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
- The existing concierge prompt already requires a null route to be reported as unavailable; this PR
  does not change prompt text.
- 25 route-intent tests + 8 tool tests pass.

## Post-merge production proof (2026-11-09, deployed SHA `82b014947f`)

The merged PR did make the tool run, but the first real production turn still failed:

- Question: “Walk from Parque Lleras to Provenza”.
- AG-UI SSE: `TOOL_CALL_START` `computeRouteTool` **twice**, both with
  `origin.placeId = "ChIJC5nPIzP024QRZo05wS3p8SI"` and
  `destination.placeId = "ChIJ1z6y7zJ624QRR0fKV0Lx6FI"`.
- Both `TOOL_CALL_RESULT`s: `{"route":null,"source":"google_routes","reason":"route_unavailable"}`.
- `ai_runs.metadata.tool_spans`: two `compute-route` spans, `deployment_sha` `82b014947f`.
- The UI answer was the honest unavailable message — no invented ETA — but no real route.
- Direct Google probe with the same IDs: `404 Place ID ... not found`. The model had
  invented the IDs. Bare address names also return an empty route set; Places Text
  Search resolves both names correctly inside the Medellín bias.

### Root cause and fix

1. The forced tool call trusted model-generated waypoints. The user's own endpoints were
   parsed only to decide *whether* to force, then discarded.
2. `route-tool-choice.ts` now returns a deterministic `RouteTurnPlan` (origin, destination,
   travel mode) from the user's text, and the concierge stores it on the shared
   RequestContext before forcing `computeRouteTool`.
3. The tool resolves each planned name through the existing server-only
   `google-places-client.searchText` (Medellín bias, smallest `places.id` mask) and sends
   real Place IDs to the existing Routes client. A resolution failure returns
   `route_unavailable` without calling Routes.
4. The per-turn result cache now stores honest failures as well as successes, and an
   in-flight promise is shared, so sequential or concurrent duplicate calls cannot spend
   another Routes/Places call or quota slot. Planned routes cache independently of the
   optional polyline flag.
5. Endpoint resolution runs before the Routes quota is consumed, so a typo cannot burn a
   route slot. Mode detection scans only the instruction text outside the two endpoints,
   and an explicit walk wins over an incidental "metro"/"bus"/"bike" place name.
6. Cache lookups use own-property checks, so a place literally named `constructor` still
   resolves through Places instead of hitting `Object.prototype`.
5. Travel mode is derived from the user's wording (walk/drive/bike/transit, English and
   Spanish), including “And by car?” / “¿Y en bici?” follow-ups. A trailing mode clause
   (“… to the airport by car”) is stripped from the place name before Places resolution.

### Verification

- Focused Vitest: 125/125 pass across route-tool-choice, compute-route, output guard and
  concierge (18 output-guard cases, including a two-successful-route turn).
- Live provider probe with the production server key, using the exact tool + plan path:
  - Parque Lleras → Provenza WALK = **361 m / 371 s**
  - Parque Lleras → Provenza DRIVE = **440 m / 221 s**
  - Laureles → Provenza WALK = **6,269 m / 5,477 s**
- TypeScript and ESLint pass.

Cross-request retries remain intentionally uncached: a fresh user turn asks for a fresh
ETA. Quota limits still apply, and the answer never estimates when Google fails.

### Success-path hallucination caught and fixed

The first fixed local candidate answered well on desktop but the 390px run said
“361 m, roughly **5 minutes along Calle 70**”. The tool result was 371 seconds and contained
no street name. The model was still embellishing a real route.

`route-output-guard.ts` now builds the whole successful route answer from the provider
result — distance, duration rounded to whole minutes, mode, the supplied caution and
Google Maps attribution — and drops the model's route text. The direct local SSE now emits
exactly:

> Google Maps: 361 m, about 6 minutes walking. Walking routes may omit sidewalks or
> pedestrian paths. Use caution.

The same guard preserves a separate café/rental/booking answer when another user-facing
tool ran after the route (regression covered).

### Promotion status at the time of this record

The code, tests, live provider probe and local real-browser journey pass. PR #836 is
**not merged**: GitHub reports `REVIEW_REQUIRED` and the only available automation account
is the PR author, so it cannot record the required review. Vercel previews are protected by
SSO and the automation bypass secret did not establish a browser session. Therefore this
record does **not** claim a deployed production route; it claims a proven candidate plus a
documented promotion blocker.
