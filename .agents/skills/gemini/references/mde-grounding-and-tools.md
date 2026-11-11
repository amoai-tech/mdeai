# MDE grounding and tool routing

Use this reference when an MDE request needs current web information, a known public URL, place/location reasoning, or a combination of Gemini-native tools and MDE business tools.

## Decision rule

```text
Need fresh/current discovery?
→ Google Search

Already know the exact public URL?
→ URL Context

Need place/location reasoning?
→ Maps Grounding

Need several of those?
→ Gemini tool combination

Need an authenticated business action?
→ MDE/Mastra domain tool

Need a persisted mutation?
→ authenticated backend/Supabase path
```

## Google Search

Use for discovery and current facts such as events, restaurants, opening hours, venue updates, travel information, and recent changes.

- Prefer authoritative sources when available.
- Do not call Search when trusted supplied context already answers the request.
- Preserve grounding metadata and citations through the response/UI.

Official reference: https://ai.google.dev/gemini-api/docs/google-search

## URL Context

Use when the exact public URL is already known or after Search has identified a page that needs deeper inspection.

- Do not send private, localhost, authenticated, signed, or sensitive URLs.
- Account for retrieved-page token cost.
- Preserve URL citation metadata.
- Keep requests scoped to only the pages needed for the user task.

Official reference: https://ai.google.dev/gemini-api/docs/url-context

## Maps Grounding

Use for grounded place/location reasoning such as nearby recommendations, itinerary context, venue comparisons, and understanding location relationships.

Maps Grounding is not MDE's rendering layer:

```text
Gemini Maps Grounding = place/location reasoning
Google Maps JS/Places = map UI, markers, routes, Places rendering
MDE domain tools       = business rules/actions
```

Preserve required place attribution. Route UI/rendering or route-computation work to the `maps` skill.

Official reference: https://ai.google.dev/gemini-api/docs/maps-grounding

## Tool combination

Prefer Gemini-native tools for information acquisition and evidence gathering. Use authenticated MDE/Mastra tools for business actions.

Examples:

```text
Search venue            → Gemini Google Search
Read venue website      → Gemini URL Context
Understand location     → Gemini Maps Grounding
Book viewing            → MDE/Mastra tool
Write booking to DB     → authenticated backend/Supabase
```

Avoid duplicating Search/URL/Maps retrieval logic in custom tools unless the native tool cannot satisfy the requirement or MDE needs a controlled authenticated data source.

Official reference: https://ai.google.dev/gemini-api/docs/tool-combination

## Verification

For grounded flows, verify:

- the selected tool matches the information need;
- citations/grounding metadata survive to the user-facing result;
- authenticated actions never execute through a read-only grounding tool;
- Maps grounding and Maps rendering remain separate;
- failure/fallback behavior is explicit when a grounding tool is unavailable.
