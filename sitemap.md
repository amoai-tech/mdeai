---
title: MDE AI — Current App Router Sitemap
updated: 2026-09-15
source: src/app
source_sha: 1f56d9f4d9ce13b5a22a13b511c2d68cb0f32723
prod: https://www.mdeai.co
---

# MDE AI — Current App Router Sitemap

This document is the current **source-backed route inventory** for `src/app`.

Rules:

- `src/app` is the source of truth for Next.js pages and route handlers.
- Planned routes are **not** listed as if they exist. Track planned work in Linear.
- Route groups such as `(broker)` organize source files but do not appear in the public URL.
- This Markdown file is a product/developer route inventory. It is separate from a search-engine `sitemap.xml`.

Current inventory: **57 route source files — 32 pages + 25 route handlers.**

## 1. Product pages — 32

### Consumer and discovery

| Route | Source | Current behavior |
|---|---|---|
| `/` | `src/app/page.tsx` | Public home/discovery entry |
| `/chat` | `src/app/chat/page.tsx` | Public AI concierge |
| `/rentals` | `src/app/rentals/page.tsx` | Public rental browse |
| `/rentals/[id]` | `src/app/rentals/[id]/page.tsx` | Public rental detail |
| `/events` | `src/app/events/page.tsx` | Public events browse |
| `/events/[slug]` | `src/app/events/[slug]/page.tsx` | Public event detail |
| `/restaurants` | `src/app/restaurants/page.tsx` | Public restaurant browse |
| `/cafes` | `src/app/cafes/page.tsx` | Public café browse |
| `/nightlife` | `src/app/nightlife/page.tsx` | Public nightlife browse |
| `/venues` | `src/app/venues/page.tsx` | Public venue/partner landing |
| `/saved` | `src/app/saved/page.tsx` | Auth-protected saved items |
| `/trips` | `src/app/trips/page.tsx` | Auth-protected trips |
| `/trips/[id]` | `src/app/trips/[id]/page.tsx` | Auth-protected trip detail |

### Tickets and account

| Route | Source | Current behavior |
|---|---|---|
| `/login` | `src/app/login/page.tsx` | Public login |
| `/signup` | `src/app/signup/page.tsx` | Public signup |
| `/me/tickets` | `src/app/me/tickets/page.tsx` | Auth-protected ticket wallet |
| `/me/tickets/[id]` | `src/app/me/tickets/[id]/page.tsx` | Auth-protected ticket + QR detail |

### Host

| Route | Source | Current behavior |
|---|---|---|
| `/host` | `src/app/host/page.tsx` | Host entry page |
| `/host/dashboard` | `src/app/host/dashboard/page.tsx` | Auth-protected host dashboard |
| `/host/analytics` | `src/app/host/analytics/page.tsx` | Auth-protected host analytics |
| `/host/event/new` | `src/app/host/event/new/page.tsx` | Auth-protected event creation |
| `/host/events` | `src/app/host/events/page.tsx` | Auth-protected host event list |
| `/host/rentals` | `src/app/host/rentals/(broker)/page.tsx` | Auth-protected rental-host/broker entry |
| `/host/rentals/dashboard` | `src/app/host/rentals/(broker)/dashboard/page.tsx` | Auth-protected rental-host dashboard |
| `/host/rentals/listings` | `src/app/host/rentals/(broker)/listings/page.tsx` | Auth-protected rental listing management |
| `/host/rentals/onboarding` | `src/app/host/rentals/onboarding/page.tsx` | Auth-protected rental-host onboarding |

> `(broker)` is a Next.js route group and is omitted from the URL.

### Partners and business

| Route | Source | Current behavior |
|---|---|---|
| `/partners` | `src/app/partners/page.tsx` | Public partner hub |
| `/partners/signup` | `src/app/partners/signup/page.tsx` | Public partner signup |
| `/partners/rentals` | `src/app/partners/rentals/page.tsx` | Existing shell route |
| `/sponsors` | `src/app/sponsors/page.tsx` | Existing shell route |
| `/business/ai` | `src/app/business/ai/page.tsx` | Existing shell route |

### Internal operations

| Route | Source | Current behavior |
|---|---|---|
| `/admin/event-bookings` | `src/app/admin/event-bookings/page.tsx` | Event-booking operations page |

## 2. Route handlers — 25

### AI runtime and approvals

| Route | Source | Purpose |
|---|---|---|
| `/api/copilotkit/[[...path]]` | `src/app/api/copilotkit/[[...path]]/route.ts` | CopilotKit / Mastra runtime bridge |
| `/api/approval-commit` | `src/app/api/approval-commit/route.ts` | Approved write/commit flow |
| `/api/scorers` | `src/app/api/scorers/route.ts` | Scorer endpoint |
| `/api/threads` | `src/app/api/threads/route.ts` | Conversation/thread endpoint |

### Events

| Route | Source | Purpose |
|---|---|---|
| `/api/events/[id]/public` | `src/app/api/events/[id]/public/route.ts` | Public event retrieval |
| `/api/events/proposal` | `src/app/api/events/proposal/route.ts` | Event proposal flow |
| `/api/events/public` | `src/app/api/events/public/route.ts` | Public events endpoint |
| `/api/events/search` | `src/app/api/events/search/route.ts` | Event search |
| `/api/grounding/event-web` | `src/app/api/grounding/event-web/route.ts` | Web-grounded event discovery |

### Places and discovery

| Route | Source | Purpose |
|---|---|---|
| `/api/grounded/search` | `src/app/api/grounded/search/route.ts` | Grounded discovery search |
| `/api/places/detail` | `src/app/api/places/detail/route.ts` | Place detail lookup |
| `/api/places/photo` | `src/app/api/places/photo/route.ts` | Place photo proxy |
| `/api/restaurants/search` | `src/app/api/restaurants/search/route.ts` | Restaurant search |

### Rentals and leads

| Route | Source | Purpose |
|---|---|---|
| `/api/rentals/search` | `src/app/api/rentals/search/route.ts` | Rental search |
| `/api/leads/schedule-viewing` | `src/app/api/leads/schedule-viewing/route.ts` | Rental viewing/lead capture |
| `/api/host/rentals/listings/[id]/detail` | `src/app/api/host/rentals/listings/[id]/detail/route.ts` | Host rental listing detail |
| `/api/host/rentals/listings/publish` | `src/app/api/host/rentals/listings/publish/route.ts` | Host rental listing publish |

### Partners and venue booking

| Route | Source | Purpose |
|---|---|---|
| `/api/partners/activate` | `src/app/api/partners/activate/route.ts` | Partner activation |
| `/api/partners/venue-leads` | `src/app/api/partners/venue-leads/route.ts` | Partner venue leads |
| `/api/venue-booking/request` | `src/app/api/venue-booking/request/route.ts` | Venue booking request |

### Tickets and payments

| Route | Source | Purpose |
|---|---|---|
| `/api/tickets/checkout` | `src/app/api/tickets/checkout/route.ts` | Ticket checkout creation |
| `/api/tickets/wallet` | `src/app/api/tickets/wallet/route.ts` | Ticket wallet data |

> Ticket payment webhook processing is handled outside this Next.js route inventory when implemented as a Supabase Edge Function. There is no current `src/app/api/tickets/webhook/route.ts` in this source tree.

### Admin

| Route | Source | Purpose |
|---|---|---|
| `/api/admin/event-bookings` | `src/app/api/admin/event-bookings/route.ts` | Admin event-booking API |

### Auth handlers

| Route | Source | Purpose |
|---|---|---|
| `/auth/callback` | `src/app/auth/callback/route.ts` | Supabase auth callback |
| `/auth/signout` | `src/app/auth/signout/route.ts` | Sign out/session clear |

## 3. Inventory summary

| Type | Count |
|---|---:|
| Page routes | **32** |
| Route handlers | **25** |
| **Total route source files** | **57** |

## 4. Removed stale claims

The previous sitemap mixed implemented routes with roadmap URLs and contained claims that no longer match `src/app`.

This regeneration removes those ambiguities, including the old claims that:

- `/rentals` redirects to `/chat`
- `/rentals/[id]` is missing
- planned `/broker/*`, `/admin/*`, `/legal/*`, `/notifications`, `/onboarding`, and other roadmap URLs are already application routes
- `/api/tickets/webhook` is a current Next.js route handler

Future/planned URLs belong in the MDE AI Linear project until their corresponding `page.tsx` or `route.ts` exists.

## 5. SEO sitemap status

This file is **not** `/sitemap.xml`.

A production search-engine sitemap and robots configuration should be implemented separately through Next.js metadata routes such as:

```text
src/app/sitemap.ts
src/app/robots.ts
```

Do not add those URLs to this inventory until the source files exist.

## Regeneration rule

Whenever `src/app/**/page.tsx` or `src/app/**/route.ts` is added, removed, or moved:

1. regenerate this inventory from `src/app`;
2. verify route groups do not leak into public URLs;
3. update route counts;
4. keep roadmap-only URLs in Linear rather than this live inventory.
