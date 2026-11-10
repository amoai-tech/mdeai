# PR #862 - Trips timezone editor and stop position

## Commands

- `npx vitest run src/lib/trips/__tests__/itinerary-logic.test.ts src/components/trips/__tests__/itinerary-panel.test.tsx src/components/trips/__tests__/trip-workspace-view.test.tsx src/components/trips/__tests__/trip-map-panel.test.tsx src/components/trips/__tests__/trip-timezone-editor.test.tsx src/app/trips/__tests__/actions.test.ts` - **32/32 passed**
- `npm run typecheck` - passed
- `npx eslint` on changed TS files - passed
- `npm run floor` on an earlier head - **5691 passed / 51 skipped**, exit 0
- Final-head local `npm run floor` - **killed with exit 137 (OOM)** during Vitest; no assertion failure. Exact-head CI is the release gate.

## Database proofs

- `trip_items.position`: `NOT NULL`, no default, `CHECK (position >= 0)`.
- Backfill: `null_pos=0`.
- Append trigger: first append `0`, next append `1`; append after explicit `5` produced `6`.
- Composite uniqueness: duplicate `(trip_id, position)` rejected; same position in another trip accepted.
- Deferrable: `SET CONSTRAINTS ... DEFERRED; UPDATE position = position + 1` succeeded; positions `1,2`.
- Trigger ACL: `anon=false`, `authenticated=false`, `service_role=true`.

## Not run

- No browser/E2E journey on this branch; production has not been deployed.
- pgTAP executed on the local Supabase database: **8/8 passed** (all position/uniqueness/deferred assertions). CI `supabase-acl` will replay it against a fresh stack.
