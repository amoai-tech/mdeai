# SAN-1140 / SAN-1122 follow-up — one action token, and a CI lane that actually runs the card spec

Three follow-ups after the card fixes shipped. All are developer-proof changes; the only user-visible
one is that event cards now match the other discovery cards on touch size.

## 1. One action height token instead of repeated classes

`--spacing-card-action: 2.75rem` (44px) in `src/app/globals.css`. Every discovery card footer now
reads it as `h-card-action min-w-card-action`:

| Component | Pages | Before | After |
| --- | --- | --- | --- |
| `restaurant-card.tsx` | `/restaurants` (browse) | literal `h-11 min-w-11 px-3` ×4 | token ×4 |
| `venue-browse-card.tsx` | `/cafes`, `/nightlife` | literal ×2 | token ×2 |
| `event-browse-card.tsx` | `/events` | `size="sm"` → **28px** | token → **44px** |
| `rental-browse-card.tsx` | `/rentals` | `min-h-11 lg:min-h-0` (Ask had neither) | `min-h-card-action lg:min-h-0` incl. Ask |

Measured on a real-data dev server (`getBoundingClientRect().height` of each footer control):

| Page | 320px | 1440px |
| --- | --- | --- |
| `/restaurants` | 44 / 44 / 44 | 44 / 44 / 44 |
| `/cafes` | 44 / 44 (Directions 32) | 44 / 44 (Directions 32) |
| `/nightlife` | 44 / 44 (Directions 32) | 44 / 44 (Directions 32) |
| `/events` | 44 / 44 | 44 / 44 |
| `/rentals` | 44 / 44 / 44 | 28 / 28 / 28 (deliberate `lg:min-h-0` dense desktop footer) |

Rentals keeps its existing desktop density rule; only the mobile floor now comes from the token.
Zero horizontal overflow on every page/width.

Screenshots: `token-{cafe,nightlife,events,rentals}-{320,1440}.png`.

## 2. The card spec now runs in the deterministic CI lane

`e2e/san-1140-discovery-card-actions.spec.ts` was added to `test:e2e:deterministic` and to the
`local-chromium` project. That lane has no database (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9`),
so cafés and nightlife previously rendered the outage state and the spec could only skip.

`src/mastra/tools/search-venue-anchors.ts` now serves `DETERMINISTIC_E2E_VENUES` when
`isDeterministicE2E()` is true — the same gate `DETERMINISTIC_E2E_RESTAURANTS` already used, and
false in production. The fixture is deliberately labelled (`CI Fixture Café — Laureles`), gives cafés
and nightclubs two coordinate-backed rows each, and one row per kind with **no coordinates** so the
"no invented pin" rule keeps being exercised.

### A skip is no longer a pass there

Because the deterministic lane guarantees inventory, a zero-card run **fails**:

```
$ SMOKE_BASE_URL=http://localhost:3013 PW_SKIP_WEBSERVER=1 NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT=1 \
  npx playwright test e2e/san-1140-discovery-card-actions.spec.ts --project=local-chromium --workers=1
15 passed (1.4m)          # 0 skipped
```

Against any other target (local real data, production) a missing inventory still skips honestly, so
the spec stays usable as a 60-second inner loop.

## 3. The inner loop is written down

`e2e/README.md` § "Discovery card changes — the 60-second loop" records the command, what the spec
proves, and when `npm run floor` is still required (once, before merge).

## One real bug found while doing this

The widths test measured cards by index immediately after the first card appeared. In dev the list is
briefly duplicated during hydration, so a measured card could be detached and report a null box — an
intermittent failure with no product meaning. The check now waits for a card to have a real, stable
box (and fails with a clear message if it never does).

## Tests

* `npx vitest run <browse, copilot, events, rentals, mastra tools, cafe/nightlife browse, map sync>` → **91 files, 760 tests pass**
* Deterministic-mode card spec → **15/15, 0 skipped**
* Real-data card spec → **15/15**
* `npx eslint <changed files> --max-warnings 0` → clean; `npx tsc --noEmit` → clean
* `npm run floor` → exit 0
