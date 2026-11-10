# SAN-472 · Keep Rental Cards and Map Pins in Sync Using Real Listing Locations — PR #265 evidence

## User outcome / scope
Existing rental cards and Google Maps pins use the same validated rental identity and location. An unmapped rental still has Details but no phantom pin; chat starts without the demo Laureles marker. No rental database, pgvector, RLS, or viewing-RPC change.

## Verified code and focused tests — 2026-10-11 (America/Bogota)
- Initially reproduced one fake map pin in `/chat`, then verified zero initial pins using `src/app/chat/__tests__/chat-page-client-real-pins.test.tsx`.
- Previous isolated PR head: 21/21 focused tests, ESLint, TypeScript and diff checks passed.
- Before merge from main, 15 consecutive focused runs of `rental-browse-card.test.tsx` passed, but GitHub full Floor failed 1/2,253 tests at `src/components/rentals/__tests__/rental-browse-card.test.tsx:217` (hover preview).
- Verified root cause after merging latest main: `VenueCardShell` changed from `onMouseEnter` to `onPointerEnter` with touch rejection; the old hover test dispatched a mouseover. Adjusted regression to dispatch pointerover with `pointerType=touch` (ignored) and `pointerType=mouse` (previews).
- After merging main, 18/18 focused tests passed, including 14 rental browse-card tests; another 21/21 focused test run passed on the previous head. A full local Floor rerun subsequently passed 2,229 Vitest tests (24 skipped).
- Added concise JSDoc to eight touched public/internal runtime functions, including browse, chat, map conversion and sync.

## Release proof still required
- **Local merged-main `npm run floor` PASSED, exit 0** using three explicit non-production build-time placeholders (Supabase URL, publishable key and Google Maps browser key). Lint, typecheck, Next.js production build, release/skills checks and 2,229 Vitest tests passed; 24 skipped. This proves local build logic, not live connectivity to Supabase or Maps. See `/tmp/mde-san472-floor-after-main.log` on the authorized development machine.
- Dependency audit reports **63 advisories** (18 low, 16 moderate, 29 high) below the configured critical-only floor threshold; triage them separately rather than making an unrelated dependency change to this PR.
- Exact-head GitHub required checks must complete after the final push.
- Independent human review/approval required.
- Browser checks: card hover without pan, click-to-pan, pin-to-card focus, filter stale pin cleanup, touch/mouse behavior, accessible keyboard interaction, empty state and map failure on mobile and desktop.
- Live anon Supabase previously returned zero public rentals; no synthetic listing should be published as production evidence.
- When an independently verified authorized rental is public, repeat renter-to-map journey on exact deployed SHA. Final production certification remains SAN-483.

## Reproduction and review sources
- PR: https://github.com/amoai-tech/mdeai/pull/265
- React pointer events: https://react.dev/reference/react-dom/components/common#pointer-events
- Google accessible markers: https://developers.google.com/maps/documentation/javascript/advanced-markers/accessible-markers
- Supabase public RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
