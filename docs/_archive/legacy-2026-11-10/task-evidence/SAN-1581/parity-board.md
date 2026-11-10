# SAN-1581 /app parity board

- Verified against `main` `7f8a2817796262a2e1ecaf2ab6c805a36890517c`
- Manifest: `e2e/app/parity-routes.json`
- Suite: `e2e/app/parity.spec.ts`
- Run: 2026-10-25, Chromium, 3 passed (guest redirects, Ana journey, Carlos/admin)
- Fix found by this suite: `/app/rentals` rendered a nested `<main>`; changed the adapter wrapper to `<div>` so the AppShell stays the only landmark.

| Surface | Legacy | /app | Guard | Proof | State |
| -- | -- | -- | -- | -- | -- |
| Personal saved | `/saved` | `/app/me/saved` | proxy + page | real collection name + refresh | proven |
| Wallet | `/me/tickets` | `/app/me/tickets` | proxy + page | buyer session, empty/own orders | proven |
| Ticket pass | `/me/tickets/:id` | `/app/me/tickets/:id` | proxy + page + RLS | PR #519 production: owner token-free QR, foreign 404 | proven |
| Rentals | `/host/rentals` | `/app/rentals` | proxy + layout + RLS | concierge, owner broker | proven |
| Listings | `/host/rentals/listings` | `/app/rentals/listings` | proxy + layout + RLS | listings page, one main | proven |
| Events list | `/host/events` | `/app/events` | proxy + layout + RLS | own event names, Carlos absent | proven |
| Overview | `/host/dashboard` | `/app/events/overview` | proxy + layout + RLS | KPI cards, one chat region | proven |
| Analytics | `/host/analytics` | `/app/events/analytics` | proxy + layout + RLS | KPI cards | proven |
| Wizard | `/host/event/new` | `/app/events/new` | proxy + layout + page | hostEventAgent wizard, one main | proven |
| Partner | `/partners/profile` | `/app/partners/profile` | proxy + page + RPC | settings, `?partner=` preserved | proven |
| Contests | `/admin/contests` | `/app/contests` | proxy + page + action + RPC | admin sees list; non-admin denied | proven |

Ticket-pass proof is retained from PR #519's production QA; this suite does not mint a paid order.
Viewings and Votes remain out of scope until SAN-1426 and SAN-1525 prove their read paths.
