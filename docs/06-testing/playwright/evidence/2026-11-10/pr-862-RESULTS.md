# PR #862 - Trips timezone editor and stop position

## Commands

- `npx vitest run src/lib/trips/__tests__/itinerary-logic.test.ts src/components/trips/__tests__/itinerary-panel.test.tsx src/components/trips/__tests__/trip-workspace-view.test.tsx src/components/trips/__tests__/trip-map-panel.test.tsx src/components/trips/__tests__/trip-timezone-editor.test.tsx src/app/trips/__tests__/actions.test.ts` - **33/33 passed**
- `npm run typecheck` - passed
- `npx eslint` on changed TS files - passed
- `npm run floor` on an earlier head - **5691 passed / 51 skipped**, exit 0
- Final-head local `npm run floor` - **killed with exit 137 (OOM)** during Vitest; no assertion failure. Exact-head CI is the release gate.
- `psql "$LOCAL_DB_URL" -f supabase/tests/database/san277_trip_position_test.sql` - **8/8 pgTAP passed** against the local Supabase database.

## Database proofs

- `trip_items.position`: `NOT NULL`, no default, `CHECK (position >= 0)`.
- Backfill: `null_pos=0`.
- Append trigger: first append `0`, next append `1`; append after explicit `5` produced `6`.
- Composite uniqueness: duplicate `(trip_id, position)` rejected; same position in another trip accepted.
- Deferrable: `SET CONSTRAINTS ... DEFERRED; UPDATE position = position + 1` succeeded; positions `1,2`.
- Duplicate repair: 4 rows / two duplicate groups renumbered to unique positions `2,0,3,1`; no rows dropped.
- Trigger ACL: `anon=false`, `authenticated=false`, `service_role=true`.

## Not run

- No browser/E2E journey on this branch; production has not been deployed.
- CI `supabase-acl` must replay the new pgTAP file against a fresh stack.
