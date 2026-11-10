# SAN-1540 / SAN-1541 / SAN-1542 — restaurant owner workspace evidence

Date: 2026-10-27 (America/Bogota)
Branch: `feat/san-1540-restaurant-owner-workspace`
Base: `origin/main` `c59a51c648`

## What was proved

| Requirement | Proof |
| -- | -- |
| Partner A edits the restaurant assigned to A | `supabase/tests/database/san1540_restaurant_partner_access_test.sql`; `e2e/app/restaurant-owner-workspace.spec.ts` |
| Partner B cannot edit A; unauthenticated denied | same SQL suite; API returns 403 and the editor renders the unavailable state |
| Spoofing A's `partner_locations.google_place_id` to B's Place ID grants nothing | SQL suite + browser spec; both leave B unchanged |
| Assignment and protected fields are rejected | `restaurant_owner_patch` allowlist (22023) + route Zod; SQL asserts |
| Admin assigns an unassigned restaurant, then B can edit it | SQL suite |
| Save → reload → persisted row; unrelated row unchanged | browser spec + direct DB readback |
| Reservation request appears once with real status | browser spec (customer form → `venue_booking_requests` → partner inbox) |
| Photos, menu and hours persist and render publicly | browser spec + `restaurant-public-*` assertions |
| 390px layout has no horizontal overflow | browser spec at 390×844 |

## Commands

```bash
npx supabase db reset
npx supabase test db supabase/tests/database/san1540_restaurant_partner_access_test.sql \
  supabase/tests/database/san1541_restaurant_content_editor_test.sql \
  supabase/tests/database/san1542_restaurant_request_inbox_test.sql
npx vitest run src/lib/restaurants src/app/api/partners/restaurants src/lib/app/__tests__
PW_SKIP_WEBSERVER=1 npx playwright test e2e/app/restaurant-owner-workspace.spec.ts --project=chromium
npm run floor
```

Results on the current PR head (through `038ed766` plus the review repairs):

- pgTAP: 3 files, **65 assertions** passing (33 partner/assignment, 19 menu/photos, 13 inbox), including behavioural storage-folder inserts and the image-validation cases.
- Focused Vitest: **24 files / 136 tests** passing (`src/lib/restaurants`, `src/lib/venues`, the partner restaurant routes and the workspace contexts).
- Playwright: **8 tests passing** (5 restaurant-owner tests + 2 existing partner-workspace tests + 390px), against a fresh local Supabase stack with real rows.
- `npm run floor`: **exit 0** (505 Vitest files / 3,881 tests passed, 37 skipped; lint, typecheck, Next.js build, env contract, CopilotKit v2 audit, Mastra schema gate).
- Fixture cleanup was re-queried after the run: 0 partners, 0 fixture restaurants, 0 venue requests, 0 menu items and 0 partner locations remained.
- Live website import probe against `https://moshimedellin.co/` returned sourced fields and flagged unverified ones; no write occurred.

## Screenshots

- `owner-editor-390.png` — the editor at 390px.
- `reservation-inbox.png` — the real request in the correct partner inbox.
- `public-restaurant.png` — the public Details page after photos/menu were saved.

Development records created by the browser spec are throwaway partner/restaurant rows deleted in `afterEach`; the database was re-queried for restaurants, partners, venue_booking_requests, restaurant_menu_items and partner_locations. No Phase A business approval, ownership paperwork or publishing gate was introduced.

### Review verification

- Codacy Cloud: 0 introduced issues on `d98331462c`; required static-analysis check green. The later review repairs are re-checked on the new head by CI.
- A stale local Supabase schema (`PGRST204` for `restaurants.partner_id`) caused a transient local browser failure during the Codacy refactor. After `supabase db reset`, both the SQL suite and the browser suite passed; that failed run is not presented as evidence.
- CodeRabbit's follow-up caught invalid `$...$` quoting in two new pgTAP assertions (which stopped 17 assertions from running). Both were repaired to `$$...$$`; the full 33-assertion file now runs and passes.
