# SAN-1502 · MDE Rentals — Enable Full Development Journeys and Defer Real-World Approval Gates — PR 1 evidence

## User outcome / scope

An MDE development administrator can now assign the development owner and the responsible broker of a test rental, grant or revoke photo and publishing rights, and approve, reject or reopen a test listing — with every transition written to an append-only audit trail. Public visibility is unchanged: test fixtures stay excluded by `rental_listing_is_public()`, `verified` stays `false`, and no customer communication or payment is touched.

This is PR 1 of SAN-1502: the development authorization primitive and the append-only audit trail. It deliberately does not make fixtures searchable (PR 2) or allow non-admin test-renter viewings (PR 3).

## Changes

- `supabase/migrations/20261015232313_san1502_rental_test_permissions.sql`
  - `rental_test_access` — per-user development grant (`owner | broker | renter`) with expiry and revoke; RLS read-only for end users.
  - `rental_test_events` — append-only audit; UPDATE/DELETE blocked by trigger **and** revoked at privilege level.
  - `is_authorized_test_actor()` — the canonical, self-scoped predicate (`auth.uid()`); the arbitrary-id overload is `service_role`-only.
  - `rental_test_listing_is_available(...)` — one development-availability rule for PR 2/PR 3.
  - Admin RPCs: grant/revoke access, assign owner, assign broker, set photo/publishing rights, approve/reject/reopen — `SECURITY DEFINER`, `is_admin()`-gated, audited.
  - Extends the SAN-1431 material-edit exemption so admin test bookkeeping does not demote a live fixture (real content/photo/ownership edits still fail closed).
- `src/app/api/admin/rentals/test/route.ts` — 8 new actions and grants/audit in GET.
- `src/components/admin/rental-test-mode-panel.tsx` — development-access, ownership/rights/approval controls and the audit table.
- `scripts/function-acl-baseline.json` — records the new authenticated-exposed functions.

## Review fixes applied (this revision)

| Finding | Fix | Proof |
| --- | --- | --- |
| Permissions could bypass audit history | Direct INSERT/UPDATE/DELETE on `rental_test_access` revoked from `anon`/`authenticated`; admin write policies removed. Grants change only through the audited RPCs. | pgTAP A51–A53 |
| Broker reassignment ambiguity | A fixture with an active lead (`new/contacted/qualified`) or showing (`scheduled/confirmed`) keeps its broker until resolved or cleaned up; same-broker assignment is an idempotent no-op. | pgTAP A57–A60 |
| Identity checks accepted a supplied id | End-user predicate is the no-argument `is_authorized_test_actor()` reading `auth.uid()`; the arbitrary-id overload is `service_role`-only. | pgTAP A54–A56 |
| CopilotKit full-suite test | **Not fixed here** — dependency mismatch (`@copilotkit/runtime@1.75.0` + `@ag-ui/client@0.0.59` lacks `PROTOCOL_VERSION`), unrelated to these changes. | separate |

## Evidence — 2026-10-15

- `supabase db reset --local` → all migrations applied; ledger max = `20261015232313`; `vote` indexes = 44.
- `supabase test db --local` → **44 files, 1357 tests, Result: PASS** (my file: 64 assertions).
- `npx vitest run src/app/api/admin/rentals/test/route.test.ts src/components/admin/rental-test-mode-panel.test.tsx` → **44/44 passed**.
- `npm run typecheck` → **0 errors**; ESLint clean on changed files.
- `npm run check:function-acl` (explicit local DB URL) → pass (66 reachable, 67 baselined).
- `npm run check:db-url-guard` → 42 pass / 0 fail; `npm run check:skills` → PASS; `npm run check:release-gates` → 513 pass / 0 fail.

## What was NOT run / honesty

- **`npm run floor` is not fully green**, blocked only by the unrelated CopilotKit dependency test above. The local `node_modules` was stale: I restored the declared-but-missing `@chat-adapter/whatsapp@4.41.1` (no `package.json`/lock change), which took typecheck from 11 errors to 0.
- No production database was touched. The migration was validated on the local stack only; the canonical apply evidence is the clean `db reset` replay above.
- `src/lib/supabase/database.types.ts` was not regenerated (shared local DB drift). The new tables/RPCs are reached through a marked `ponytail:` untyped view of the same RLS client.
- No E2E for the new admin actions yet; independent S4 verification not yet performed.
