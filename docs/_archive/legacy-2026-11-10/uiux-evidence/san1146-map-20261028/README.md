# SAN-1146 · Café and Nightlife map selection — 2026-10-28

Scope: Existing Cafe/Nightlife browse models → nullable real venue anchors → canonical venue UUID pins → existing map/detail overlay and Ask MDE selection. No business gates or invented coordinates.

## Verification

- Live read-only Supabase venue_anchors: 17 café and 13 nightclub rows, all with valid saved coordinate pairs. No rows edited.
- Vitest 19/19 passed across existing coordinate, new map converter/card, and A→B→Clear selection tests.
- Changed-file ESLint and TypeScript passed. Final converter regression tests reran after the source-summary refinement.
- Browser: real public Supabase-backed /cafes and /nightlife, 390 and 1440 px, HTTP 200, no JavaScript page errors, no horizontal overflow, 17 / 13 coordinate-backed map pins, one selected card ID exactly matching its map overlay. See browser-results.json and mobile-rerun.json.
- Browser uses NEXT_PUBLIC_E2E_MOCK_MAPS=1 for Google tile/marker rendering only; data and selected UUIDs are real. This is not proof third-party Google Maps tiles load on public production.
- First mobile browser attempt used a broad selector and waited on a hidden desktop map; that *test selector* timed out. Mobile rerun used visible markers and passed both routes. Original results preserved.
- The local npm run floor run was interrupted by a full developer-machine reboot during Next.js build. No full-floor PASS is claimed; require exact-head GitHub floor and mastra-schema-init after pushing.
- Signed-out /api/copilotkit returned expected 401 in local development logs; no authenticated multi-turn agent proof from this work.
- Screenshots cafes-{390,1440}.png and nightlife-{390,1440}.png are local UI evidence with deterministic mock map tiles, not production screenshots.

Merge dependency: This branch incorporates compact-card PR #599; review #604 against base fix/san1390-compact-five-page-feed-20261028. Once #599 merges, retarget #604 to main and verify exact-head CI/release SHA. Never merge the combined feature into main without normal staged release verification.
