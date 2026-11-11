# SAN-1122 — three-venue action parity evidence (2026-11-05)

Baseline for this work is the completed SAN-1140 restaurant card (PR #746, deployed `9cbaa5f7`).
Restaurants, Cafés and Nightlife now share one card architecture; this evidence records the one
remaining proven mismatch and its fix.

## Confirmed defect (measured, not assumed)

Anonymous Chrome against production `https://www.mdeai.co` at 320/390/768/1440px. The card footer
actions rendered at two different heights:

| Page | `View on map` | `Ask about this` | `Directions` |
| --- | --- | --- | --- |
| `/restaurants` | n/a (no map action) | **44px** | 32px |
| `/cafes` | **28px** | **28px** | 32px |
| `/nightlife` | **28px** | **28px** | 32px |

Everything else already matched: same `VenueCardShell` + `CardFooter`, same `workspace-filters` bar,
same map panel, same neutral placeholder glyph, same title/area/tag/summary hierarchy, same
`aria-pressed` toggle semantics, and zero horizontal overflow.

Files: `before-cafe-card-{320,390,1440}.png`, `before-nightlife-card-390.png`.

## Fix

One file — `src/components/browse/venue-browse-card.tsx`: the `View on map` and `Ask about this`
buttons now use the same `h-11 min-w-11 px-3` classes as `RestaurantCard`, and the footer wrapper is
`w-full` so the controls wrap inside the card instead of stretching the card. `Directions` stays the
compact 32px link it is on restaurants. No new component, token, or shell change.

| Page | `View on map` | `Ask about this` | `Directions` | Overflow |
| --- | --- | --- | --- | --- |
| `/cafes` 320/390/768/1440 | **44px** | **44px** | 32px | 0 |
| `/nightlife` 320/390/768/1440 | **44px** | **44px** | 32px | 0 |

Files: `after-cafe-card-{320,390,1440}.png`, `after-nightlife-card-390.png`,
`after-measurements.json` (raw per-width control heights and overflow).

At 320px the footer wraps to two rows — `View on map` + `Ask about this`, then `Directions` — all
inside the card border.

## Deferred by owner decision: Café/Nightlife "Details"

There is no `/cafes/[id]` or `/nightlife/[id]` route, and no compatible read-only venue detail sheet
exists (`venue-detail-sheet.tsx` is rental/event-shaped; the chat grounded card uses a different data
contract). Option A was chosen explicitly: **no Details button is added**, so no dead link exists.
Their supported actions stay `View on map` (only with real coordinates), `Ask about this`,
`Directions`. This is a recorded deferral, not an implementation gap.

## Map behaviour (existing owner, re-proven for the `venue` category)

- `venueToMapPin` refuses missing, partial, out-of-range and non-finite coordinates → no fabricated
  pin (`src/components/browse/__tests__/venue-pin-converter.test.ts`).
- `useBrowseMapSync(["venue"])` replaces the category's pins on filter change and clears a selected
  pin that disappeared (`src/hooks/__tests__/use-browse-map-sync.test.tsx`, new `venue` case).
- Real browser A→B→Clear on both pages: `View on map` selects that card's own pin
  (`data-selected="true"`), switching releases the previous card, and activating the selected
  control again clears it.

## Commands and results

```bash
npx vitest run src/components/browse src/components/cafes src/components/nightlife \
               src/hooks/__tests__/use-browse-map-sync.test.tsx     # 9 files, 47 tests pass

SMOKE_BASE_URL=http://localhost:3012 PW_SKIP_WEBSERVER=1 \
  npx playwright test e2e/san-1140-discovery-card-actions.spec.ts \
  --project=chromium --workers=1                                    # 15/15 pass

npx eslint <changed files> --max-warnings 0                         # clean
npx tsc --noEmit                                                    # clean
npm run floor                                                       # exit 0
```

The browser spec now also asserts the 44px shared action height on every rendered card at every
tested width, so a future regression fails instead of being noticed by eye.
