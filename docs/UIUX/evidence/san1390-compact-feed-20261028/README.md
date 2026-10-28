# SAN-1390 — Compact discovery feed, pre-merge evidence

**Base:** main at c4708bedd1702d950d26959b4784333c2a511bc3.
**Scope:** presentation of five existing discovery routes; not completion of the 36-check epic.

## Implementation
- Events, Restaurants, Rentals, Cafés and Nightlife now use one vertical feed of the existing VenueCardShell rows, with 96px inline thumbnails/placeholders.
- The existing DiscoveryWorkspace, Ask MDE composer, data IDs, map selectors and real venue/price/ticket/viewing actions stay in place.
- The rental inline variant preserves its real displayed price/currency and Details/Schedule buttons. Pages without a map keep a max 768px centered reading column.
- The mobile Restaurants contest banner is now compact but still links to /contests.
- No new agent, search system, database migration, business gate or fabricated map pin/photo.

## Local verification
- Focused component Vitest: 54/54 passed across 4 files.
- Changed-file ESLint, TypeScript: PASS.
- npm run floor: PASS; 3,996 passing tests, 35 skipped, build, lint, typecheck and Mastra schema checks passed.
- Real Playwright: initial 10/10 390/1440 route checks rendered existing cards, composer and 96px thumbnails with no horizontal overflow or page exceptions.
- A cold Next dev compile exceeded the first 30-second /events 390 browser timeout; immediate recheck succeeded.
- Running a full production build simultaneously with Next dev later caused several missing UI renders despite HTTP 200. A clean restart and rerun are recorded in clean-browser-results.json; empty renders are never counted as passing.

## Evidence
Screenshots: events-{320,390,768,1440}.png and each other page at {390,1440}.png. Public listing content is real. Screenshot-only CSS hides Next.js and CopilotKit development inspector overlays, without changing application DOM/behavior. Browser readback JSON is included.

## Outside this UI PR
- Guest local CopilotKit info requests can return 401 and show an inspector warning. This is not evidence that signed-in Mastra grounded replies work. SAN-737 and SAN-1145 own AI follow-up.
- SAN-1146 owns the missing source coordinates for base café/nightlife browse pins. No invented pins. Event list likewise has no grounded map coordinates.
- SAN-1531 owns restaurant card/pin/Details equality and voting regression; SAN-972 owns remaining Events responsive filter/keyboard proof.
- SAN-1390/SAN-1534 acceptance stays at the independently evidenced count until real user journeys prove otherwise.

## Source references
- MDE DESIGN.MD, globals.css, existing UIUX and frontend-design skills: reused current design tokens and workspace shell.
- https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ : target size and avoid focused controls hidden behind sticky composers.
- https://playwright.dev/docs/api/class-locator : real browser locators and screenshots.

**Release:** Not merged or deployed. Require exact-head GitHub CI, review and later production readback.

## PR #599 exact-head review correction
- First pushed head `9bbf9aa332` failed deterministic Chromium shard 3 on `e2e/san-1524-contests.spec.ts` because shortened visible contest CTA also changed the accessible link name expected by the shipped browser contract.
- Preserve compact visible `Explore contests` on mobile, but restore `aria-label="Explore restaurant contests"` for screen reader semantics and the existing test.
- Verified locally with `PW_SKIP_WEBSERVER=1 SMOKE_BASE_URL=http://localhost:3002 npx playwright test e2e/san-1524-contests.spec.ts --project=local-chromium --grep "restaurant directory links to contest discovery" --workers=1 --retries=0` (Playwright test-results/.last-run.json: passed, no failed tests).
- This is a P1 regression correction, not proof of entire CI/production. Required exact-head checks must rerun after push.


## PR #599 focused mobile Map correction — 2026-10-28

**Issue reproduced:** At 390px the old fixed Map trigger intersects a restaurant `Ask about this` button and, at some scroll positions, rental card actions. The trigger intercepts part of a critical action's hit area.

**Correction:** Reuse the existing `BrowseMapSheet`, rendered as a 44px inline button in `DiscoveryWorkspace`'s sticky mobile header for Rentals, Restaurants, Cafés and Nightlife when that page has a map; preserve its original floating behavior for other callers. The existing bottom-sheet map and Close control are reused. The shared map-error fallback no longer calls rentals and cafés a “restaurant list.”

**Code proof:** Five focused Vitest files: 65/65 pass; typecheck pass; changed-file ESLint and diff check required before pushing.

**Real browser proof:** 320px and 390px Rentals: HTTP 200; button stays visible after scrolling, map sheet opens and closes, and no horizontal overflow or page error. Restaurants 320px: Map opens with no overflow; Google Maps later reports `getRootNode` on a detached/undefined element. A broader browser sweep was interrupted when the local development device restarted; **do not claim complete 5-route, map-render or production verification**. The local 390px Rentals capture `map-header-rentals-390.png` shows unobstructed Schedule viewing. Development-only inspector notices are visible in the capture rather than concealed.

**Remaining gate:** independent GitHub exact-head Floor and deterministic browser suite; browser check 390/768/1440 on all affected routes, map fallback and keyboard focus, and Vercel preview/production exact-SHA readback. The map-provider runtime error is not fixed by repositioning its trigger and must not be counted as a successful rendered map.
