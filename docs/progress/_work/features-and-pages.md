# MDE AI — Feature & Page Audit (Phase A prelaunch, 2026-10-21)

**Basis of truth: `origin/main` snapshot `5d1d76ddf6`, extracted to `/tmp/mde-main`.** Every page/route/feature claim below was verified by reading that snapshot. Paths are cited as `src/...` and refer to main. The local checkout `/home/sk/mdeai` is on `ai/san-1332-frozen-canary`, a reduced canary branch — it is **not** the shipping surface; see §8.

## 0. Verified counts (main snapshot)

| Surface | Count | Command |
|---|---|---|
| Page routes (`src/app/**/page.tsx`) | **47** | `find src/app -name page.tsx \| wc -l` |
| API route handlers (`src/app/api/**/route.ts`) | **35** | `find src/app/api -name route.ts \| wc -l` |
| Auth route handlers (`/auth/callback`, `/auth/signout`) | **2** | remainder of the 37 total `route.ts` |
| Migrations | **207** `.sql` | `ls supabase/migrations/*.sql \| wc -l` |
| pgTAP specs | **72** | `ls supabase/tests/database/*.sql \| wc -l` |
| Vitest specs | **422** files | `find src -name '*.test.ts*'` |
| Playwright specs | **106** (66 root + 40 `screens/`,`host/`) | `ls e2e/*.spec.ts`, `ls e2e/{screens,host}/*.spec.ts` |
| Supabase edge functions | **10** + tests | `ls supabase/functions` |

Edge functions on main: `_shared`, `approval-commit`, `chat-lead-capture`, `process-embedding-jobs`, `ticket-checkout`, `ticket-payment-webhook`, `vote-cast`, `vote-nonce`, `whatsapp-webhook`.

**Static/dynamic note:** `/contests` and `/contests/[id]` declare `export const dynamic = "force-dynamic"` (`src/app/contests/page.tsx:12`, `src/app/contests/[id]/page.tsx:16`) so contest state is never cached stale.

---

## 1. Page routes (47)

Status: **W** Working · **P** Partial · **U** Unverified (code read, no journey proof) · **B** Broken/placeholder · **N** Not implemented · **D** Dev-only.

### Public / discovery

| Route | Role | Functionality (verified) | Data / API | AI | D/M | Status | Prio |
|---|---|---|---|---|---|---|---|
| `/` `src/app/page.tsx:22` | Public | Marketing home, 15 home sections; `q` redirects to `/chat?q=` | static | concierge entry | both | W | P0 |
| `/chat` `src/app/chat/page.tsx:4` | Public | `ChatPageClient` → `GeoChatShell` inside `MapContextProvider` | `/api/copilotkit` | CopilotKit v2 + Mastra | both | W | P0 |
| `/rentals` `src/app/rentals/(browse)/page.tsx:28` | Public | Browse; `searchRentals` at `:48`; error path `:61` | `apartments` | shared tool | both | W | P0 |
| `/rentals/[id]` `src/app/rentals/[id]/page.tsx:57` | Public | Detail + metadata | `getRentalDetail` | none | both | W | P0 |
| `/restaurants` `src/app/restaurants/page.tsx:47` | Public | Browse + cuisine/nbhd filters; contest discovery link (`e2e/san-1524-contests.spec.ts:36-39`) | `restaurants` | shared tool | both | W | P0 |
| `/restaurants/[id]` `src/app/restaurants/[id]/page.tsx:16` | Public | **Detail page exists and serves 200.** `fetchRestaurantById` → `restaurants` (`src/lib/restaurants/fetch-restaurant-by-id.ts:54`) + `vote_restaurant_target` (`:93`) + `vote_restaurant_contest_options` (`:134`); renders `RestaurantVotePanel` (`:11`); `?contest_id=` selects the ballot (`:26-31`); honest error + not-found states (`:28-41`) | `restaurants`, vote RPCs | none | both | W | P0 |
| `/cafes` `src/app/cafes/page.tsx:23` | Public | Browse via `venue_anchors` | `venue_anchors` | none | both | U | P1 |
| `/nightlife` `src/app/nightlife/page.tsx:29` | Public | Browse via `venue_anchors` | `venue_anchors` | none | both | U | P1 |
| `/events` `src/app/events/page.tsx:45` | Public | Browse, enum-validated `category`/`dateWindow`/`price` | `GET /api/events/public` | indirect | both | W | P0 |
| `/events/[slug]` `src/app/events/[slug]/page.tsx:26` | Public | Detail + `EventCheckoutNotice` + `EventDetailView` | `getPublicEvent` (`events`,`event_tickets`) | none | both | W | P0 |
| `/new-projects` `src/app/new-projects/page.tsx:18` | Public | Development-project browse; `listNewProjects` → `development_projects` (`src/lib/new-projects/queries.ts:32`) | `development_projects` | yes (AI compare tool) | both | W | P1 |
| `/new-projects/[slug]` `src/app/new-projects/[slug]/page.tsx:30` | Public | Detail; `getNewProjectBySlug` → projects + `development_unit_types` (`queries.ts:47`), `development_project_sources` (`:91`) | same | none | both | W | P1 |
| `/contests` `src/app/contests/page.tsx:181` | Public | Contest discovery list; `listPublicContests` → RPC `contest_public_list` (`src/lib/restaurants/contest-public.ts:87`); state labels `:8-13` | `vote.contests` via RPC | none | both | W | P0 |
| `/contests/[id]` `src/app/contests/[id]/page.tsx:59` | Public | Contest detail; `getPublicContest` → RPC `contest_public_get` (`contest-public.ts:113`); request-deduped via `cache()` (`:18`); `ContestNomineeCard` | `vote.*` via RPC | none | both | W | P0 |
| `/venues` `src/app/venues/page.tsx:40` | Public | Venue-partner landing, `?v=` variants | static | none | both | W | P1 |
| `/partners` `src/app/partners/page.tsx:11` | Public | Partner hub | static | none | both | W | P1 |
| `/partners/rentals` `src/app/partners/rentals/page.tsx:16` | Public | `PartnerLandingPlaceholder` | static | none | both | B | P2 |
| `/partners/restaurants` `src/app/partners/restaurants/page.tsx:13` | Public | Real landing: `<VenuesLanding variant="restaurant" />` (`:16`) | static | none | both | W | P1 |
| `/partners/cafes` `src/app/partners/cafes/page.tsx:13` | Public | `VenuesLanding` variant cafe | static | none | both | W | P1 |
| `/partners/nightlife` `src/app/partners/nightlife/page.tsx:13` | Public | `VenuesLanding` variant nightclub | static | none | both | W | P1 |
| `/business/ai` `src/app/business/ai/page.tsx:17` | Public | `PartnerLandingPlaceholder` | static | none | both | B | P2 |
| `/sponsors` `src/app/sponsors/page.tsx:16` | Public | `PartnerLandingPlaceholder` | static | none | both | B | P2 |
| `/contact` `src/app/contact/page.tsx:13` | Public | Contact form; `isPartnerType` seeds type (`:18`), `ContactLeadForm` (`:33`) → `/api/partners/contact-leads` | `leads` | none | both | W | P1 |
| `/host` `src/app/host/page.tsx:14` | Public | Event-host marketing (`EventHostLanding`) | static | none | both | W | P1 |
| `/login` `src/app/login/page.tsx:15` | Public | Email auth + `safeNextPath` | `getServerUser` | none | both | W | P0 |
| `/signup` `src/app/signup/page.tsx:10` | Public | Email auth + existing-session card | `getServerUser` | none | both | W | P0 |
| `/partners/signup` `src/app/partners/signup/page.tsx:28` | Public | Signup wizard + type picker | `/api/partners/activate` | none | both | U | P1 |

### Authenticated consumer

| Route | Role | Functionality | Data | AI | D/M | Status |
|---|---|---|---|---|---|---|
| `/saved` `src/app/saved/page.tsx:15` | User | Saved collections; anon prompt | `collections` | none | both | W |
| `/trips` `src/app/trips/page.tsx:12` | User | Trips dashboard | `trips` | none | both | W |
| `/trips/[id]` `src/app/trips/[id]/page.tsx:12` | User | Trip workspace | `trip_items` | none | both | W |
| `/me/tickets` `src/app/me/tickets/page.tsx:12` | Buyer | Upcoming/past orders | `listBuyerOrders` | none | both | U |
| `/me/tickets/[id]` `src/app/me/tickets/[id]/page.tsx:12` | Buyer | Ticket detail | wallet token | none | both | U |

### Host / broker / admin

| Route | Role | Functionality | Data | AI | D/M | Status |
|---|---|---|---|---|---|---|
| `/host/event/new` `src/app/host/event/new/page.tsx:8` | Host | `HostEventShell` with `agentId="hostEventAgent"` | `/api/approval-commit` | **yes** | desktop | U |
| `/host/events` `src/app/host/events/page.tsx:21` | Host | Auth-gated event list | `events` | none | both | W |
| `/host/dashboard` `src/app/host/dashboard/page.tsx:11` | Host | Auth-gated `HostDashboardOsShell` | `loadHostDashboardInitial` | hostOps agent | desktop | U |
| `/host/analytics` `src/app/host/analytics/page.tsx:11` | Host | Auth-gated analytics shell | same loader | none | desktop | U |
| `/host/rentals/(broker)` `.../(broker)/page.tsx:46` | Broker | Workspace + concierge; layout gate | `fetchBrokerDashboard` | rentals mode | desktop | W |
| `.../(broker)/listings/page.tsx:35` | Broker | Inventory in Suspense | `fetchBrokerListings` | none | desktop | W |
| `.../(broker)/dashboard/page.tsx:6` | Broker | 8-line redirect to overview | — | — | — | W |
| `/host/rentals/onboarding` `.../onboarding/page.tsx:13` | Broker | Wizard; unauth + already-onboarded redirects | `getBrokerContext` | none | both | W |
| `/admin/contests` `src/app/admin/contests/page.tsx:17` | Admin | Contest list; gate `is_admin()` (`:25`); `createContestAction` server action (`:6`) | RPC `admin_contest_list` (`contest-admin.ts:74`) | none | both | P |
| `/admin/contests/[id]` `src/app/admin/contests/[id]/page.tsx:13` | Admin | Detail: `ContestDetailsForm`, `ContestEntries`, `ContestActivity` (`:6-8`); `listCatalogRestaurants` (`excludeIds`) | `admin_contest_get`, `admin_contest_update`, link/unlink RPCs | none | both | P |
| `/admin/event-bookings` `src/app/admin/event-bookings/page.tsx:14` | Admin | Approval queue, three states | `/api/admin/event-bookings` | none | both | W |
| `/admin/rentals` `src/app/admin/rentals/page.tsx:14` | Admin | Rental **test mode** panel only (`:3`) | `/api/admin/rentals/test` | none | desktop | P |

### Dev-only (D)

`/dev/chat-virtualization` `page.tsx:51`, `/dev/chat-empty-thread` `page.tsx:17` (hard `notFound()` unless `isDeterministicE2E()`, `:18`), `/dev/rentals` `page.tsx:14` (`notFound()` at `:21`). Never user-reachable.

---

## 2. API routes (35 + 2 auth)

Main-only routes that matter for the plan are marked **★**.

| Route | Auth | Functionality | Downstream | Status |
|---|---|---|---|---|
| `/api/copilotkit/[[...path]]` | Supabase user + distributed rate limit | CopilotKit v2 runtime, Mastra agent map, per-turn audit | Mastra, `ai_runs` | W |
| `/api/rentals/search` | none | POST search | `apartments` | W |
| `/api/restaurants/search` | none | POST search + photo enrichment | `restaurants` | W |
| ★ `/api/restaurants/my-vote` `route.ts:15` | user (`:25`) | GET caller's receipt; **service-role RPC `vote_my_receipt`** (`:30`); 503 if no service client (`:28`) | `vote.votes` join `vote.entities`/`restaurants` | W |
| `/api/events/public`, `/api/events/[id]/public` | none | paged catalog / single event | events | W |
| `/api/events/search` | none | hybrid search, returns `hybridUsed`/`rankExplanation` | embeddings | U |
| `/api/events/proposal` | user | proposal insert | `insertEventProposal` | W |
| `/api/grounded/search`, `/api/grounding/event-web` | rate-limited | grounded place search / web grounding | Google/Gemini | U |
| ★ `/api/places/search` | rate-limited | GET place search | Google Places | W |
| `/api/places/detail`, `/api/places/photo` | rate-limited | detail / photo proxy (429, 503, 502 paths) | Google Places | W |
| ★ `/api/new-projects/search` | none | POST project search | `development_projects` | W |
| ★ `/api/partners/contact-leads` | service-role + replay/idempotency | POST contact lead; verifies saved row (`:52`), returns `replayed:true` on existing receipt (`:58`) | `leads` | W |
| `/api/partners/venue-leads` | user | venue lead → `leads` | `leads` | U |
| `/api/partners/activate` | user + service role | partner activation; 201/200, 503 | `partners` | U |
| ★ `/api/host/rentals/viewings/[id]` `route.ts:18` | user + ownership (403) | **PATCH viewing action**; validates action (`:45`), time (`:64`) | `showings` | W |
| `/api/host/rentals/listings/[id]/detail` | user + ownership | listing + contacts + lead/viewing counts | `apartments`,`leads`,`showings` | W |
| `/api/host/rentals/listings/publish` | user | publish FSM RPC | publish RPC | W |
| `/api/leads/schedule-viewing` | user session | viewing request | edge fn, `leads`/`showings` | U |
| `/api/venue-booking/request` | user | booking request | `venue_booking_requests` | U |
| `/api/tickets/checkout` | none (buyer email) | POST → edge fn `ticket-checkout`; requires session url + order + access token else 502 | Stripe (edge) | U |
| `/api/tickets/wallet` | order id + token | wallet payload | `getWalletOrderByToken` | U |
| `/api/approval-commit` | user | HITL commit → edge fn `approval-commit` | `approval_requests/decisions` | U |
| ★ `/api/admin/rentals/test` `route.ts:106` | admin `is_admin()` (`:42`) | GET test-mode fixture state; writes fixture rows (`:128-153`) | `apartments`, test tables | W (admin-only prelaunch tool) |
| ★ `/api/admin/event-bookings` | admin | queue GET, decision POST, workflow run id | `event_*` | W |
| ★ `/api/threads` | user + service role | list threads | `mastra_threads` | W |
| ★ `/api/threads/[threadId]` `route.ts:29` | user + ownership (403 `:63`) | PATCH thread title; 404/403/`updated:false` | `mastra_threads`, `mastra_messages` | W |
| ★ `/api/threads/[threadId]/messages` `route.ts:24` | user + ownership | GET history; NO_STORE; 503/404/403 | `mastra_messages` | W |
| ★ `/api/whatsapp/webhook` `route.ts:59` | Meta HMAC (`:72`), 401/400/413/503 paths | POST verify → **durably record before processing** (`after()` `:12`); GET verify handshake (`:48`); statuses (`:95-102`) | `whatsapp_*`, service role | W (server) |
| ★ `/api/whatsapp/process-inbound` `route.ts:20` | shared secret (`:22-24`) | POST sweeper: 503 when disabled/unconfigured, summary | `whatsapp_messages` | W (server) |
| `/api/scorers` | none | list Mastra scorers | `mastra_scorers` | W |
| ★ `/api/version` | none | returns `sha`, `environment`, `NO_STORE` | build env | W |
| `/api/dev/rental-photo/[slug]/[filename]` | dev fixture | local rental photo serving | filesystem | D |
| `/auth/callback`, `/auth/signout` | — | Supabase code exchange / sign out | auth | W |

---

## 3. Domain feature matrix

### 3.1 Contests & restaurant voting — **implemented** (previously mis-reported as absent)

Datastore is a **dedicated `vote` schema**, invisible to a `public`-only table query. Live DB: `vote` relations = `contests`, `categories`, `entities`, `entity_tally`, `votes`, `judge_scores`, `judges`, `scoring_criteria`, `paid_vote_orders`, `fraud_signals`, `contest_audit`; plus `public.vote_consumed_nonces`. Live rows: `contests=4` (1 live, 1 draft, 2 test fixtures), `categories=5`, `entities=15`, `votes=4`, `entity_tally=4`, `contest_audit=34`, `paid_vote_orders=0`. 19 RPCs: `contest_public_list/get`, `admin_contest_{list,get,create,update,link_restaurant,unlink_restaurant}`, `assert_contest_admin`, `vote_{restaurant_target,restaurant_contest_options,nonce,cast,receipt,my_receipt,tally,contest_context,consume_nonce}`, `contest_audit_insert`, `broadcast_vote_tally_changes`.

| Feature | Entry point | Data source | Status | Evidence | Gap |
|---|---|---|---|---|---|
| Public contest list | `src/app/contests/page.tsx:181` | RPC `contest_public_list` (`contest-public.ts:87`) | **Working** | e2e `e2e/san-1524-contests.spec.ts:41-58` (lists real contests, empty+error states, 390px overflow `:65-69`); pgTAP `san1524_contest_public_read_test.sql` | — |
| Contest detail + nominees | `src/app/contests/[id]/page.tsx:59` | RPC `contest_public_get` (`contest-public.ts:113`) | Working | pgTAP `san1524_contest_options_test.sql`; `ContestNomineeCard` | — |
| Restaurant detail (voting entry) | `src/app/restaurants/[id]/page.tsx:16` | `restaurants` + `vote_restaurant_target:93` + `vote_restaurant_contest_options:134` | Working | Serves 200 in production; e2e `san-1469-restaurant-detail.spec.ts`; pgTAP `san1483_entry_link_test.sql` | Multi-contest disambiguation relies on `?contest_id=` (`:26-31`) — no automatic pick, by design |
| Cast vote | `src/components/restaurants/restaurant-vote-panel.tsx:238` | edge fn `vote-cast` (`:150,208,238`) + `vote-nonce` (`:222`) | Working | pgTAP `san1498_restaurant_vote_rpc_test.sql`; edge tests `supabase/functions/tests/vote-cast_handler_test.ts`, `vote-cast_local_integration_test.ts` | Paid vote path (`paid_vote_orders=0`) unexercised |
| Duplicate prevention / nonce | `src/components/restaurants/restaurant-vote-panel.tsx:46,222` | `public.vote_consumed_nonces`, `vote_consume_nonce` | Working | edge test `vote_protection_fail_closed_test.ts`; pgTAP `san1484_vote_entities_access_test.sql`; `vote_consumed_nonces` present live | Fail-closed behavior proven at function level only |
| Receipt persistence | `/api/restaurants/my-vote:30` | RPC `vote_my_receipt` (joins `vote.votes`→`vote.entities`→`restaurants`) | **Partial** | pgTAP `san1469_my_receipt_test.sql`; `parseReceipt` (`vote-panel.tsx:50`); e2e `san-1469-restaurant-vote.spec.ts` | No browser proof that a receipt survives reload and re-renders without double-voting |
| Standings / tally | read via `vote_tally`, `entity_tally` | RPCs `vote_tally`, `broadcast_vote_tally_changes` | **Unverified** | pgTAP `san1497_vote_tally_test.sql`, `san1497b_contest_wide_tally_test.sql`, `san1470_contest_leaderboard_test.sql` | No page/route rendering standings was confirmed; no e2e asserts a tally |
| Test-fixture hiding | `contest_public_list` / `contest_public_get` | `vote.contests` state filter | **Unverified** | No pgTAP or e2e in snapshot asserts fixtures are excluded from the public list; live DB has 2 test fixtures among 4 contests | **Verify before launch**: `/contests` could expose test fixtures |
| Admin contest management | `src/app/admin/contests/page.tsx:17`, `[id]/page.tsx:13` | RPCs `admin_contest_*`; server action `createContestAction` | **Partial** | e2e `admin-sign-in.spec.ts` proves non-admin refusal + login link on all three admin routes; pgTAP `san1526_contest_admin_test.sql` | No e2e of a real admin creating/editing/linking a contest |
| Vote audit | — | `vote.contest_audit` (34 rows live) | Working | `contest_audit_insert`; rows present | No admin UI surface for audit |

### 3.2 Rest of the matrix

| Domain | Feature | Entry point | Data source | Status | Evidence | Gap |
|---|---|---|---|---|---|---|
| Rentals | Browse/filters | `rentals/(browse)/page.tsx:28` | `apartments` | Working | `san-483-production-rental-journey`, `REAL-011` | — |
| Rentals | Detail | `rentals/[id]/page.tsx:57` | `apartments` | Working | `san-1202-rental-detail` | — |
| Rentals | Schedule viewing | `api/leads/schedule-viewing` | edge fn, `leads`,`showings` | Unverified | no browser insert proof | — |
| Rentals | Broker viewing action | `api/host/rentals/viewings/[id]:18` | `showings` | Working | e2e `san-1204-broker-viewing-requests`; pgTAP `san1286_atomic_viewing_test.sql`, `san1206_broker_viewing_actions_test.sql` | — |
| Rentals | Broker onboarding/inventory | `(broker)/page.tsx:46`, `listings/page.tsx:35` | broker libs | Working | `san-1092-broker-onboarding`; pgTAP `san1105/san1349/san476` | — |
| Rentals | Landlord management UI | — | `landlord_profiles`, `landlord_inbox` exist | **Not implemented** | no `landlord*` route among 47 pages | Tables + RLS only |
| Rentals | New projects | `new-projects/*` | `development_*` | Working | e2e `SAN-1379-new-projects`, `SAN-1380-new-projects-ai`; pgTAP `san1379/1385/1404/1406` | — |
| Events | Discovery/detail | `events/page.tsx:45`, `[slug]/page.tsx:26` | public routes | Working | `san-518`, `ck-v2-015-events-chip` | — |
| Events | Host create (AI) | `host/event/new/page.tsx:8` | approval edge fn | Unverified | unit `host-event-agent.test.ts` | no draft→publish e2e |
| Events | Checkout/payment | `api/tickets/checkout` | edge fn + Stripe webhook | Unverified | `san-715-checkout-states` asserts states only | paid→ticket chain unproven |
| Events | Wallet/tickets | `me/tickets*` | `event_orders` | Unverified | — | — |
| Events | Refunds / payouts | — | `event_order_refunds`, `revenue_ledger` | **Not implemented** | no route/UI in 35 handlers | tables only |
| AI Concierge | Chat + runtime | `chat/page.tsx:4`, `api/copilotkit` | Mastra | Working | `home-to-chat`, `concierge-new-chat`, `prod-copilotkit-isolation`, `copilotkit-request-budget` | — |
| AI Concierge | Grounded tools | `src/mastra/tools/search-*` | Supabase + embeddings | Working | `intelligence-*` unit suite | tool-level, not journey |
| AI Concierge | Thread history/titles | `api/threads/[threadId]{,/messages}` | `mastra_threads/messages` | Working | `thread-history-authz`, `copilotkit-thread-routes-authz` | — |
| AI Concierge | HITL approvals | `api/approval-commit` | edge fn | Unverified | `approval-commit-schema`, `approval-panel` | no apply proof |
| AI Concierge | Maps/pins | `platform/maps/*` | Maps JS | Working | `maps-grounding`, `maps-layout-*`, `maps-007b` | — |
| Discovery | Cafés / nightlife | `cafes:23`, `nightlife:29` | `venue_anchors` | Unverified | `san-575-*visual-evidence` only | visual-only proof |
| Discovery | Places search/detail/photo | `api/places/{search,detail,photo}` | Places + `place_details_cache` | Working | route tests | — |
| Partners | Hub + vertical landings | `partners/page.tsx:11`, `partners/{restaurants,cafes,nightlife}/page.tsx:13` | static | Working | `san-692-partner-hub`, `san-713-restaurant-partners` | rentals/ai/sponsors still placeholders |
| Partners | Signup/activation | `partners/signup/page.tsx:28`, `api/partners/activate` | `partners` | Unverified | unit only | no e2e |
| Partners | Contact lead capture | `contact/page.tsx:13`, `api/partners/contact-leads` | `leads` | Working | e2e `san-693-contact`; unit `partners/contact-lead-form` | — |
| Partners | Dashboard/analytics/assistant | — | `partner_*` | **Not implemented** | no partner-authenticated page | biggest partner gap |
| Super Admin | Contests | `admin/contests*` | vote RPCs | Partial | `admin-sign-in`, `san1526` | no create e2e |
| Super Admin | Event bookings | `admin/event-bookings` | `is_admin()` | Working | route + queue tests | — |
| Super Admin | Rentals test mode | `admin/rentals`, `api/admin/rentals/test` | `apartments` fixtures | Working (dev tool) | `admin-rental-test-mode.spec.ts` | not a production admin surface |
| Super Admin | Users/roles, media, imports, transactions, monitoring | — | tables exist | **Not implemented** | no routes | — |
| Infrastructure | Auth/SSR clients, RLS | `lib/supabase/{server,service}` | — | Working | pgTAP `fashionos_rls_exposure`, `san476`, `san1284a/b/c`; `auth-guard` e2e | — |
| Infrastructure | WhatsApp intake | `api/whatsapp/{webhook,process-inbound}`, edge `whatsapp-webhook` | `whatsapp_*`, `wa_outbox` | Working (server) | HMAC verify `route.ts:72`; pgTAP `san1444_whatsapp_{delivery_tracking,inbound_durability}`; edge test `whatsapp-webhook_deny_all_test.ts` | channel activation/config unverified |
| Infrastructure | Embeddings / pgvector | `embedding_jobs`, edge `process-embedding-jobs` | pgvector | Working | pgTAP `embedding_worker_pipeline_test.sql`; `embedding-contract` unit | — |
| Infrastructure | Observability | `search_logs`, `ai_runs`, `/api/scorers` | — | Partial | unit telemetry tests | no dashboard |
| Infrastructure | Version/deploy visibility | `api/version` | env | Working | — | — |

---

## 4. User journeys

**Renter.** `/rentals` (`(browse)/page.tsx:28`) → `searchRentals` → card → `/rentals/[id]` (`:57`) → `getRentalDetail` → CTA → `POST /api/leads/schedule-viewing`. **Breakpoint:** the final insert depends on an edge function with no browser-level proof; e2e stops at CTA wiring.

**Broker.** Broker layout gate → `/login` or onboarding → `/host/rentals/onboarding` → inventory (`listings/page.tsx:35`) → viewing inbox → `PATCH /api/host/rentals/viewings/[id]:18`. **Solid on main** (unlike the canary branch): action endpoint exists, validated (`:45,:64`), ownership 403, pgTAP atomic-viewing coverage, e2e `san-1204`.

**Organizer.** `/host/event/new` → `hostEventAgent` draft → `/api/approval-commit` → edge fn → published slug link → `/host/events` list → `/host/analytics`. **Breakpoint:** no e2e proves draft→approve→publish; unit + schema tests only.

**Ticket buyer.** `/events/[slug]` → checkout → edge `ticket-checkout` → Stripe → edge `ticket-payment-webhook` → `/me/tickets` or token wallet. **Breakpoint:** everything after the Next.js proxy is untested in-repo; no test asserts a paid order becomes a readable ticket. Refunds have no implementation.

**Restaurant voter (real journey on main).** `/restaurants` → `/restaurants/[id]?contest_id=` (`restaurants/[id]/page.tsx:16-31`, target resolved by `vote_restaurant_target:93`) → `RestaurantVotePanel` → edge `vote-nonce` (`vote-panel.tsx:222`) → edge `vote-cast` (`:238`) → receipt via `/api/restaurants/my-vote:30` (`vote_my_receipt`). Evidence: pgTAP `san1498`, `san1484`, `san1469`; edge handler + local-integration tests; e2e `san-1469-restaurant-vote`. **Breakpoints:** (a) receipt persistence across reload not proven end-to-end; (b) standings rendering unverified; (c) public list fixture-hiding unverified despite 2 test fixtures in a 4-row table; (d) paid vote path (`paid_vote_orders=0`) unexercised.

**Contest admin.** `/admin/contests` (`:17`) → create action → `/admin/contests/[id]` (`:13`) → details form / entries / activity. **Breakpoint:** authorization refusal is proven (`admin-sign-in.spec.ts` over `/admin/contests`, `/admin/event-bookings`, `/admin/rentals`); a successful create/edit/link is only pgTAP-proven (`san1526`), not browser-proven.

**Venue partner.** `/venues` or `/partners/{restaurants,cafes,nightlife}` → `/partners/signup` → `/api/partners/activate` (unverified) → **nothing**. No partner dashboard, listings, leads view, or analytics. Journey terminates after activation.

**Admin.** Sign-in → one of three admin areas (contests, event bookings, rental test mode); each server-gated by `is_admin()` **and** re-gated in its route handler (test mode `:42`). **Breakpoint:** scope is contests + event bookings + a rental test-mode tool; users, roles, media, imports, transactions, monitoring absent.

**AI concierge.** `/` `?q=` → `/chat` → CopilotKit v2 runtime (auth + distributed rate limit + audited Mastra agents) → grounded tools → rich cards + map pins → thread history/titles → optional HITL action. **Breakpoint:** the HITL apply step (`/api/approval-commit` → edge fn) has no execution proof.

---

## 5. Test inventory (main snapshot)

| Layer | Count | Location | What it actually asserts | Maps to |
|---|---|---|---|---|
| Vitest | 422 files | `src/**/*.test.{ts,tsx}` | tool logic, schemas, classifiers, route authz, component render, contracts | AI tools, rentals, events, contest libs (`src/lib/restaurants/__tests__`), partners, maps, whatsapp |
| Playwright | 106 specs (66 root + 40 sub) | `e2e/` | journeys, visual evidence, prod smokes, auth guards, admin gates | `san-1524-contests`, `san-1469-restaurant-{detail,vote}`, `admin-sign-in`, `san-483`, `san-1204`, `san-715`, `san-693-contact`, `SAN-1379/1380`, `prod-journey-j05-j20`, `maps-*`, `e2e/host/*` |
| pgTAP | 72 | `supabase/tests/database/` | RLS isolation, vote-schema replay/access, contest public read + admin, tally, receipt, publish FSM, ACLs, whatsapp durability, embeddings, new projects | 10 contest/vote specs: `san1469,san1470,san1482,san1484,san1497,san1497b,san1498,san1524 ×2,san1526` |
| Edge function tests | `supabase/functions/tests/*` | vote-cast handler + local integration, vote-nonce, vote protection fail-closed, whatsapp deny-all, chat-lead-capture, embedding jobs | voting security + whatsapp | — |
| Node `--test` | `scripts/__tests__/*.test.mjs` | env contract, hooks, skill layout, migration preflight, release gates | infrastructure | — |
| Probes/smokes | `scripts/probe-concierge-*.mjs`, `perf-*.mjs`, `prove-ven-021-insert.mjs` | manual runtime probes, not in `npm test` | concierge/venue insert | — |

**Biggest untested-in-repo chains:** Stripe checkout→webhook→wallet; HITL approval apply; host AI draft→publish; partner activation; vote receipt survival across reload; contest standings rendering; public contest fixture filtering.

---

## 6. Claims vs reality (doc claim → code truth)

| Claim | Reality | Citation |
|---|---|---|
| "Super Admin covers users, roles, inventory, imports, media, events, approvals, transactions, monitoring" | Exactly **four** admin pages: contests list, contest detail, event bookings, rentals test mode | `find src/app/admin -name page.tsx` = 4 |
| "Partners get profile, onboarding assistant, listings, leads, analytics" | Signup + activation API + contact-lead capture only; no partner-authenticated page | 47-page list; `partners/signup/page.tsx:28` |
| "Landlord management" is a product feature | No landlord route or UI; `landlord_profiles`/`landlord_inbox` tables only | no `landlord*` page; tables in live DB |
| "Refunds and payouts" | Tables `event_order_refunds`, `revenue_ledger`, `commission_claims`, `payments` exist; **no route or UI** | 35 route handlers contain none |
| "Contests absent" (my own first-pass claim — **retracted**) | Fully implemented in a dedicated `vote` schema: 11 tables, 19 RPCs, 4 contests/15 entities live, 2 edge functions, 10 pgTAP specs, 2 e2e specs | §3.1 evidence column |
| "Restaurant detail missing" (my own first-pass claim — **retracted**) | `/restaurants/[id]` exists, serves 200, and is the voting entry point | `src/app/restaurants/[id]/page.tsx:16` |
| "WhatsApp channel not implemented" (my own first-pass claim — **retracted**) | Webhook with HMAC verification + durable inbound record + sweeper route + dedicated edge function + pgTAP durability specs | `api/whatsapp/webhook/route.ts:59-102`; `san1444_*` |
| `partner_profiles` is the partner identity table | Live DB has `partners`, `partner_organizations`, `partner_members`, `partner_drafts`; **no** `partner_profiles` | information_schema |
| Public contest list is production-clean | Live `vote.contests` = 4 rows including 2 test fixtures; no test asserts public filtering | `vote.contests` counts; no fixture-hiding spec found |

---

## 7. Contested claims verified against the LIVE database

Queries run with `/tmp/mde_sql.sh` (read-only), project `zkwcbyxiwklihegjhuql`:

- Cross-schema `pg_class` search for `%contest%|%vote%|%nominee%` → **`vote` schema relations exist**: `contests`, `categories`, `entities`, `entity_tally`, `votes`, `judge_scores`, `judges`, `scoring_criteria`, `paid_vote_orders`, `fraud_signals`, `contest_audit` (11). A `public`-only `information_schema.tables` query returns only `delivery_receipts` and `vote_consumed_nonces` — **that is exactly why a public-only check wrongly concluded "contests absent"**.
- `pg_proc` in `public` for `%vote%|%contest%|%receipt%` → **19 functions**, including `cast_restaurant_vote`, `vote_tally`, `vote_my_receipt`, `vote_consume_nonce`, `contest_public_list/get`, six `admin_contest_*`, `assert_contest_admin`, `broadcast_vote_tally_changes`, `contest_audit_insert`.
- Row counts: `vote.contests=4`, `vote.categories=5`, `vote.entities=15`, `vote.votes=4`, `vote.entity_tally=4`, `vote.contest_audit=34`, `vote.paid_vote_orders=0`; `public.vote_consumed_nonces` exists.
- `pg_get_functiondef('public.vote_my_receipt')` confirms receipts are derived from `vote.votes` ⋈ `vote.entities` ⋈ `public.restaurants`, filtered `source='audience' AND restaurant_ballot`, ordered by `created_at` — receipt truth is the votes table, not a separate receipt table.

**Interpretation:** contests/voting are *working product surface*, not roadmap. Residual risk is not existence but the four Unverified items in §3.1 (receipt survival, standings rendering, fixture hiding, paid votes).

---

## 8. Local checkout vs `origin/main` — release risk, not product truth

`/home/sk/mdeai` is on `ai/san-1332-frozen-canary`. `git diff origin/main --stat` = **676 files changed, 4,783 insertions, 70,991 deletions**.

| Surface | origin/main | Local checkout |
|---|---|---|
| Pages | 47 | 33 |
| API routes | 35 (+2 auth) | 23 (+2 auth) |
| pgTAP | 72 | 18 |
| Contests | 3 public + 2 admin pages, `my-vote` route, vote RPCs | **all deleted** |
| Restaurant detail | present | deleted |
| Admin pages | 4 | 1 |
| WhatsApp intake | 2 routes + edge fn | deleted |
| Broker viewing actions | present | deleted |
| Rentals browse | `(browse)/page.tsx` | different `src/app/rentals/page.tsx` |
| Thread management | list + rename + history | list only |

**Risk statement:** the canary branch is a *behavioral fork*, not a deployable subset — it silently removes contests, voting, restaurant detail, WhatsApp intake, three of four admin pages, broker viewing mutations, and thread management, and drops 54 pgTAP specs. If any release pipeline builds from this branch while docs/QA describe main, the shipped app will be missing Phase-A features that main's tests assert. Resolve which branch ships **before** the plan's feature matrix is baselined; this audit intentionally describes main because that is what the docs and tests describe.

---

## 9. Method & limits

- Every route claim was verified by reading the file in `/tmp/mde-main` (grep for exports/auth/`from(`/`rpc(`/`fetch`, then full reads for contests, restaurant detail, admin pages, whatsapp, threads, viewings, partner landings). No status inferred from filenames.
- Live DB used only for existence and row counts; no writes, and `mcp__supabase__*` was deliberately not used (points at a different project).
- Tests were inventoried, **not executed**. "Working" = code path read and consistent with the cited test/evidence; anything crossing Stripe, an edge function, or depending on an unasserted runtime property is marked **Unverified**.
- Three explicit retractions are recorded in §6 (contests, restaurant detail, WhatsApp) with the root cause: a `public`-schema-only table query.
