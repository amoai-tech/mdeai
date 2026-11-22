---
title: MDE AI — Route Sitemap (source inventory)
updated: 2026-11-22
source_of_truth: Next.js src/app/ at main 0c3daf59af; Linear owns work and product status
status: Source-verified route inventory, not live UX certification
---

# MDE AI — Implemented Route Sitemap

**Code snapshot:** 22 Nov 2026, GitHub `main` `0c3daf59af`. The authoritative route source is `src/app/**/page.tsx` and `src/app/**/route.ts`; check the target SHA again before changing routes. This file is a **code inventory**, not a list of live, finished or publicly accessible experiences. Actual server authorization, deployment aliases, feature completeness and successful transactions require independent tests.

**Inventory:** **74 page routes** and **50 route-handler paths**, including two `/auth/` handlers and one `/events/[slug]/calendar` handler. Next.js route groups such as `(browse)`, `(broker)` and `(workspace)` are filesystem-only and do **not** appear in URLs.

**Meaning of these entries:** `ROUTE EXISTS` = a matching `page.tsx` or `route.ts` exists. It does **not** mean authenticated login, checkout, booking, AI response, webhook, production deployment or mobile UX passed. For live feature status use the exact existing Linear issue; for user outcomes use [prd.md](prd.md) and [roadmap.md](roadmap.md). [AGENTS.md](AGENTS.md) controls prelaunch Phase A development.

## Primary user journeys (verification targets)

| Journey | Connected code routes | What independently proves functionality |
| --- | --- | --- |
| Renter | `/rentals` → `/rentals/[id]` → `/rentals/bookings/new` or source/viewing review | Exact source ID through card, known map pin and Details. **Viewing:** one persisted lead + showing with correct broker. **Booking intent:** separately prove the authenticated idempotent booking write; never conflate them. [SAN-755](https://linear.app/amo100/issue/SAN-755) |
| Broker | `/host/rentals` or `/app/rentals` → listings/onboarding | Real draft/media save, atomic partner/apartment commit, correct scoped leads/viewings; [SAN-677](https://linear.app/amo100/issue/SAN-677), [SAN-1107](https://linear.app/amo100/issue/SAN-1107) |
| Events | `/events` → `/events/[slug]` → actual checkout/wallet and host workspace | Test payment/webhook/entitlement readback with retries; route existence alone proves nothing |
| Concierge | `/` → `/chat` or contextual discovery/Host AI | Grounded tool → real card/optional map → authorized action → saved result; existing Concierge/Host providers remain distinct |
| Partner/operator | `/partners/*`, `/app/partners/*`, `/admin/*`, `/app/admin/*` | Authorized A/B/guest tests and audited data changes; no Phase A business approval gates |

**CopilotKit component-first migration:** [SAN-1675](https://linear.app/amo100/issue/SAN-1675) owns the shared official Standard Catalog contract for the approved Rentals pages; [DESIGN.MD](DESIGN.MD), [spec.md](spec.md) and [plan.md](plan.md) explain deterministic page UI, real action wiring, scoped Host/Concierge providers and final parity proof. Route existence is not component-catalog implementation proof.

## Page routes — files present in `src/app/`


### Consumer and discovery route files (17)

- `/`
- `/cafes`
- `/chat`
- `/contests`
- `/contests/[id]`
- `/events`
- `/events/[slug]`
- `/new-projects`
- `/new-projects/[slug]`
- `/nightlife`
- `/rentals`
- `/rentals/[id]`
- `/rentals/bookings/[id]`
- `/rentals/bookings/new`
- `/restaurants`
- `/restaurants/[id]`
- `/venues`


### Account, saved, trips and ticket route files (13)

- `/app`
- `/app/me`
- `/app/me/notifications`
- `/app/me/saved`
- `/app/me/tickets`
- `/app/me/tickets/[id]`
- `/login`
- `/me/tickets`
- `/me/tickets/[id]`
- `/saved`
- `/signup`
- `/trips`
- `/trips/[id]`


### Partner and marketing route files (13)

- `/app/partners/profile`
- `/app/partners/restaurants`
- `/app/partners/restaurants/[id]`
- `/business/ai`
- `/contact`
- `/partners`
- `/partners/cafes`
- `/partners/nightlife`
- `/partners/profile`
- `/partners/rentals`
- `/partners/restaurants`
- `/partners/signup`
- `/sponsors`


### Host and rental broker route files (12)

- `/app/rentals`
- `/app/rentals/listings`
- `/app/rentals/onboarding`
- `/host`
- `/host/analytics`
- `/host/dashboard`
- `/host/event/new`
- `/host/events`
- `/host/rentals`
- `/host/rentals/dashboard`
- `/host/rentals/listings`
- `/host/rentals/onboarding`


### Event/contest workspace route files (10)

- `/app/contests`
- `/app/contests/[id]`
- `/app/events`
- `/app/events/[id]`
- `/app/events/analytics`
- `/app/events/attendees`
- `/app/events/check-in`
- `/app/events/new`
- `/app/events/overview`
- `/app/events/tickets`


### Operations and admin route files (6)

- `/admin/contests`
- `/admin/contests/[id]`
- `/admin/event-bookings`
- `/admin/rentals`
- `/app/admin/events`
- `/app/admin/restaurants`


### Developer-only route files (3)

- `/dev/chat-empty-thread`
- `/dev/chat-virtualization`
- `/dev/rentals`


## Route handlers — files present in `src/app/`

These routes may implement GET, POST or other methods; the table is **not** a verified method/authorization contract. Verify each handler before use.


### AI runtime, conversation and scoring (5)

- `/api/copilotkit/[[...path]]`
- `/api/scorers`
- `/api/threads`
- `/api/threads/[threadId]`
- `/api/threads/[threadId]/messages`


### Rentals, leads and broker operations (7)

- `/api/host/rentals/listings/[id]/detail`
- `/api/host/rentals/listings/publish`
- `/api/host/rentals/viewings/[id]`
- `/api/leads/schedule-viewing`
- `/api/rentals/bookings`
- `/api/rentals/photo-failures`
- `/api/rentals/search`


### Events, ticketing and venue booking (10)

- `/api/approval-commit`
- `/api/events/[id]/public`
- `/api/events/proposal`
- `/api/events/public`
- `/api/events/search`
- `/api/tickets/checkout`
- `/api/tickets/validate`
- `/api/tickets/wallet`
- `/api/venue-booking/request`
- `/events/[slug]/calendar`


### Places, local discovery and restaurants (9)

- `/api/grounded/search`
- `/api/grounding/event-web`
- `/api/new-projects/search`
- `/api/places/detail`
- `/api/places/photo`
- `/api/places/search`
- `/api/restaurants/my-vote`
- `/api/restaurants/search`
- `/api/venues/search`


### Partner and administration APIs (12)

- `/api/admin/event-bookings`
- `/api/admin/rentals/test`
- `/api/partners/activate`
- `/api/partners/contact-leads`
- `/api/partners/onboarding/url-draft`
- `/api/partners/profile`
- `/api/partners/restaurants`
- `/api/partners/restaurants/[id]`
- `/api/partners/restaurants/[id]/assignment`
- `/api/partners/restaurants/[id]/menu`
- `/api/partners/restaurants/[id]/website-import`
- `/api/partners/venue-leads`


### WhatsApp routes (2)

- `/api/whatsapp/process-inbound`
- `/api/whatsapp/webhook`


### Auth and operational handlers (5)

- `/api/dev/rental-photo/[slug]/[filename]`
- `/api/health`
- `/api/version`
- `/auth/callback`
- `/auth/signout`


## Other deployment/runtime boundaries

- Ticket payment finalization is **not** a Next.js `/api/tickets/webhook` file. The repository contains `supabase/functions/ticket-payment-webhook/index.ts` (Supabase Edge Function). Deployment, Stripe subscriptions, webhook delivery and a paid ticket **must be verified separately**; do not infer them from this source.
- WhatsApp is **implemented at the route-file level** through `/api/whatsapp/webhook` and `/api/whatsapp/process-inbound`. That does **not** certify configured Meta credentials, pilot delivery, AI retrieval or user-visible responses.
- **Do not advertise missing routes as implemented:** no Next page file for `/broker`, `/broker/leads`, `/broker/listings`, `/admin` index, `/admin/users`, `/legal/privacy`, `/legal/terms`, or `/restaurants/[slug]` in this snapshot. New paths belong to real approved feature work, not sitemap-driven duplicate tasks.
- The older October sitemap's `/rentals` → `/chat` redirect claim is obsolete: `src/app/rentals/(browse)/page.tsx` implements the browse route. A direct real-world browser test must still validate search/cards/Details/transactions.
- The older `LIVE` / `SHELL` / `MVP` / `POST` badges, hardcoded counts, release blockers, historic SAN status and published-webhook claims are intentionally removed. A source file cannot certify test outcomes or launch readiness.

## How to keep the sitemap accurate

1. From the target branch/commit, enumerate `src/app/**/page.tsx` and `src/app/**/route.ts` (or use `git ls-files src/app` and filter those suffixes). Strip directory route groups `(group)`; retain dynamic segments `[id]`, `[slug]` and catch-all segments.
2. Compare the changed route paths against the relevant sections above. Update both the entries and snapshot counts **in the same PR** as the route change; do not invent new paths just for completeness.
3. If a claim concerns live behavior, verify deployed SHA, session authorization and actual UI → API → DB or provider receipt; report that proof in Linear, not as an evergreen green checkbox in this file.
4. Development (Phase A) does not require rental owner/partner approval, photo-rights paperwork, moderation, publication or viewing permission gates. Keep authentication, RLS/private-data isolation, truthful attribution, atomic writes, idempotency and safe payment testing.

**Historical source:** [October 2026 sitemap snapshot](docs/_archive/root-sitemap-2026-10-06.md). Source code paths and product requirements override that historical status list.
