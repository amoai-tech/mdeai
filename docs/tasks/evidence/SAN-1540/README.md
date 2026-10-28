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

Results on the commit this folder describes:

- pgTAP: 3 files, 60 assertions, all passing.
- Focused Vitest: 14 files, 97 tests, all passing.
- Playwright: 8 tests passing (5 restaurant-owner tests + 2 existing partner-workspace tests + 390px), against a local Supabase stack with real rows; fixtures deleted; post-cleanup checks confirmed restaurants, partners and venue_booking_requests only.
- `npm run floor`: exit 0 (503 Vitest files / 3,870 tests passed, lint, typecheck, build, env contract, Mastra schema gate).

## Screenshots

- `owner-editor-390.png` — the editor at 390px.
- `reservation-inbox.png` — the real request in the correct partner inbox.
- `public-restaurant.png` — the public Details page after photos/menu were saved.

Development records created by the browser spec are throwaway partner/restaurant rows deleted in `afterEach`; the database was re-queried for restaurants, partners and venue_booking_requests only. No Phase A business approval, ownership paperwork or publishing gate was introduced.

### Subsequent verification
- At commit `d98331462c`, Codacy Cloud had 0 introduced issues, required check green.
- Full `npm run floor` passed: 3,872 tests, 35 skipped.
- A local browser rerun got 1 pass, 5 fixture setup failures from `PGRST204` (stale local Supabase schema lacked `restaurants.partner_id`). This is **not a successful restaurant E2E run**. Revalidate with a fresh migrated stack.
