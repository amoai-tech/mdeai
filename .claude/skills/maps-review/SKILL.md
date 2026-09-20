---
name: maps-review
description: Review MDE Google Maps and Places changes for API-key exposure, grounding integrity, field-mask/cost regressions, invalid map configuration, and invented place data.
metadata:
  owner: SAN-1312
  version: "1.0.0-mde.1"
---

# Google Maps / Places PR Review

## Source of truth

1. Changed MDE map/place code and tests.
2. Canonical MDE .claude/skills/maps/SKILL.md.
3. Current Google Maps Platform documentation / Code Assist.
4. Actual provider responses or stored grounded records.

## Review invariants

- Keep server-only Places/grounding credentials out of client bundles; browser keys must remain appropriately restricted.
- Use the required Places (New) field mask for the exact endpoint and fields needed.
- Do not invent or transform ungrounded place_id, latitude/longitude, URLs, hours, ratings, prices, availability or business facts into provider truth.
- Preserve mapId where AdvancedMarker or current Maps API requirements need it.
- Reuse/cache grounded results when safe instead of repeating avoidable billable requests.
- Keep map/list/chat identity synchronized to stable provider or database IDs.
- API/version claims must be verified against current Google Maps Platform documentation.

For a field-mask or billable-call defect include the exact request path, smallest request/cache fix, and a targeted test or instrumentation proof showing the intended fields with no unnecessary request.
