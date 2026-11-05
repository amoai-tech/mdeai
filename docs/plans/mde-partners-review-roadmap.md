# MDE Partners — Architecture Review, UX Audit & Implementation Roadmap

Date: 2026-10-18 · Repo: amoai-tech/mdeai · Epic: SAN-1538 · View: partner-mde

This document is an implementation guide, not a feature wishlist. It records only facts verified against origin/main, live Linear, the live Supabase project and the running app.

## 1. Executive summary

**Working now:** the public partner hub and venue landings; café/nightlife/restaurant signup entry; partner activation API; guest contact form with persisted receipt, idempotent replay, 409 conflict, durable rate limiting and privacy-safe logging (PR #372/#391, live); venue lead form UI with category preselect; partner tables with RLS enabled.

**Broken or unsafe before this change:** /api/partners/venue-leads had no durable rate limit, no idempotency, no replay/conflict protection, and logged the submitter's email. A retry could create a second lead and every submit wrote PII to logs. This roadmap's first fix addresses it.

**Missing:** a real partner profile edit route, a partner dashboard, one shared partnerAgent, the AI suggestion bridge, Gemini URL-context extraction, partner-scoped agent tools, onboarding analytics, and deterministic truthfulness evals.

**Blockers:** none are business gates. The blockers are implementation dependencies: shared agent → suggestion UI → URL extraction → profile persistence. Phase A forbids adding approval/paperwork gates.

**Next:** land the venue-lead reliability fix (this PR), then the shared partner agent, then the editable AI suggestion UI, then URL extraction and profile editing.

## 2. Current architecture (verified)

- Next.js 16 App Router + React 19, one app, one marketing shell (MarketingPageShell), one venue landing (VenuesLanding), one signup wizard, one partner activation API.
- CopilotKit v2 and Mastra runtimes already exist for the concierge/host paths; no partner-specific agent is registered.
- Supabase: partners, partner_members, partner_drafts, leads, landlord_profiles, event_venues all have RLS enabled. leads has a UUID PK and idempotency_key; no new table is needed for inquiry idempotency.
- Google Maps/Places is used by existing venue/rental paths; pgvector exists for search. Neither is a signup prerequisite.
- WhatsApp is canceled (SAN-689). Do not revive it or claim it works.

### Minimal target architecture

~~~mermaid
flowchart LR
  U[Partner / Visitor] --> UI[Next.js 16 App Router]
  UI --> CK[CopilotKit v2 provider]
  CK --> RT[AG-UI runtime /api/copilotkit]
  RT --> MA[Mastra agentRegistry]
  MA --> PA[partnerAgent]
  PA --> GM[Gemini models + URL Context]
  UI --> API[Server APIs / Server Actions]
  API --> SB[(Supabase: Auth, partners, members, drafts, leads)]
  PA --> TOOLS[Server tools: partner-scoped reads/writes]
  TOOLS --> SB
  API --> RL[Durable rate limit RPC]
  RL --> SB
~~~

Rules: one runtime, one partnerAgent, server-derived identity for every tool, no client-supplied partner id, no second CRM, no duplicate profile store.

## 3. Core vs advanced

| Lane | Tasks | Real-world purpose |
| -- | -- | -- |
| Core | SAN-882 venue leads · SAN-705 shared agent · SAN-709 reviewable AI suggestions · SAN-1193 website autofill · SAN-814 profile edit | A partner can inquire, sign up, get help, and correct their data |
| Advanced | SAN-1391 rental draft/resume · SAN-706 partner-scoped agent data · SAN-1154 venue URL analysis · SAN-1428 truthfulness evals · SAN-1393 onboarding analytics | Reliability, safety, reuse across verticals |

## 4. Progress tracker

Legend: 🟢 verified complete · 🟡 partial · 🔴 proven failure · 🔵 unstarted/not proven. Percentages are fulfilled acceptance groups ÷ applicable groups; "Unverified" where no run exists.

| Task | Linear | Status | Verified progress | Evidence | Missing / next |
| -- | -- | -- | -- | -- | -- |
| SAN-882 · MDE Venues — Prevent Duplicate Leads and Improve Partner Signup | [SAN-882](https://linear.app/amo100/issue/SAN-882) | 🟡 In progress (this PR) | 3/5 groups (retry, privacy, UI receipt) | route/schema/helper/form diff; 13 focused tests pass; live DB: replay 200 replayed, 409 conflict, 1 row | CI/floor + PR merge; CTA/gallery audit remains |
| SAN-705 · MDE Partner AI — Add One Assistant for Every Partner Type | [SAN-705](https://linear.app/amo100/issue/SAN-705) | 🔵 Todo | 0/1 certified | Runtime exists; no partner-agent file | Register agent + trusted context + authenticated response |
| SAN-709 · MDE Partner Signup — Let AI Suggest Fields You Can Review and Edit | [SAN-709](https://linear.app/amo100/issue/SAN-709) | 🔵 Todo | 0/1 certified | Existing editable wizard only | Proposal schema + agent context + Accept/Edit/Ignore |
| SAN-1193 · MDE Partner Signup — Autofill Business Details From a Website | [SAN-1193](https://linear.app/amo100/issue/SAN-1193) | 🔵 Todo | 0/1 certified | partners.settings JSONB exists | Gemini URL Context, safe URL, evidence, persisted review |
| SAN-814 · MDE Partner Profiles — View and Edit Business Details | [SAN-814](https://linear.app/amo100/issue/SAN-814) | 🔵 Backlog | 0/1 certified | Membership/schema exist; no edit route | Owner-scoped PATCH/save/readback + outsider denial |
| SAN-1391 · Let Rental Owners and Brokers Save and Resume Setup | [SAN-1391](https://linear.app/amo100/issue/SAN-1391) | 🟡 In Progress | Unverified | PR #244 open, not mergeable | Reconcile enum, add RLS/resume tests |
| SAN-706 · Partner AI accesses only the signed-in partner's data | [SAN-706](https://linear.app/amo100/issue/SAN-706) | 🔵 Backlog | 0/1 certified | Auth + RLS exist | Positive/negative tenant tool tests |
| SAN-1154 · Safely analyze venue websites with Gemini URL Context | [SAN-1154](https://linear.app/amo100/issue/SAN-1154) | 🔵 Backlog | 0/1 certified | Venue tables exist | Reuse SAN-1193 + SAN-709 + SAN-814 |
| SAN-1428 · Prove AI suggestions never invent property facts | [SAN-1428](https://linear.app/amo100/issue/SAN-1428) | 🔵 Backlog | 0/1 certified | Deterministic eval spec exists | Typed corpus, unknown/ambiguity cases |
| SAN-1393 · See where partners drop off and why setup failed | [SAN-1393](https://linear.app/amo100/issue/SAN-1393) | 🔵 Todo | 0/1 certified | Analytics integration exists | Typed PII-free onboarding events |

**Certified complete: 0/10.** Core: 0/5. Advanced: 0/5. Code touched in this PR: SAN-882 only.

## 5. Ordered roadmap

### 1.1 Venue lead reliability — SAN-882 (this PR)
Files: src/app/api/partners/venue-leads/route.ts, src/lib/partners/venue-lead-schema.ts, src/lib/partners/submit-venue-lead.ts, src/components/partners/partner-lead-form.tsx, route/form tests.
Behavior: request UUID = leads.id; payload fingerprint replay; 409 on changed replay; check_rate_limit 12/hour; no PII logs; receipt shown; hydration-gated submit. No migration.
Checkpoint: focused tests, live DB replay/conflict, 390px, floor, exact-head CI.

### 1.2 Shared partner agent — SAN-705
Files: src/mastra/agents/partner-agent.ts (new), src/mastra/agents/index.ts, src/mastra/index.ts, src/lib/copilotkit-client-props.ts, runtime route.
Checkpoint: one authenticated partner response; existing concierge/host unaffected.

### 1.3 Reviewable AI suggestions — SAN-709
Files: src/lib/onboarding/ai-suggestion.ts, src/components/onboarding/onboarding-copilot-bridge.tsx, onboarding-ai-suggestion-card.tsx, signup wizard.
Checkpoint: Accept/Edit/Ignore; manual save still works on AI failure; no silent writes.

### 1.4 Website autofill with evidence — SAN-1193
Files: src/lib/onboarding/business-url.ts, extract-business-url.ts, src/app/api/partners/onboarding/url-draft/route.ts, wizard, activation schema/client.
Checkpoint: public URL → sourced fields → review → one saved partner; bad URL fails safely.

### 1.5 Profile edit and readback — SAN-814
Find the canonical update owner first; add only the missing authorized route/UI. Checkpoint: owner edit/readback; outsider denied; 390px.

### 2.1 Rental draft/resume — SAN-1391
Finish PR #244; reconcile landlord enum with current schema; no rental business gates. Checkpoint: concurrent save/resume + RLS tests + floor.

### 2.2 Partner-scoped agent data — SAN-706
Server-derived identity in tools; A allowed, B/anon denied, retry safe.

### 2.3 Venue URL analysis — SAN-1154
Reuse 1.3/1.4/1.5; never fabricate unknown facts; preserve Places attribution.

### 2.4 Truthfulness evals — SAN-1428
Typed fixtures; unknown/ambiguity/currency/coordinates; no automatic conversion to confirmed values.

### 2.5 Onboarding analytics — SAN-1393
PII-free events; count only after DB commit; retry-safe.

~~~mermaid
flowchart TD
  A[1.1 SAN-882 lead reliability] --> B[1.2 SAN-705 shared partnerAgent]
  B --> C[1.3 SAN-709 suggestion UX]
  C --> D[1.4 SAN-1193 URL autofill]
  D --> E[1.5 SAN-814 profile edit]
  B --> F[2.2 SAN-706 partner-scoped tools]
  D --> G[2.3 SAN-1154 venue analysis]
  C --> H[2.4 SAN-1428 truthfulness evals]
  E --> H
  F --> I[2.5 SAN-1393 onboarding analytics]
  G --> I
  J[2.1 SAN-1391 rental draft] --> B
~~~

## 6. User journey (onboarding + AI)

~~~mermaid
flowchart LR
  A[Partner landing] --> B{Inquire or sign up}
  B -->|Guest inquiry| C[Venue form]
  C --> D[POST venue-leads]
  D --> E{Replay?}
  E -->|identical| F[Same receipt]
  E -->|changed| G[409]
  E -->|new| H[One leads row]
  B -->|Signup| I[Typed wizard]
  I --> J[Optional website URL]
  J --> K[Gemini URL Context]
  K --> L[partnerAgent proposal]
  L --> M[User Accept/Edit/Ignore]
  M --> N[Authorized activation/save]
  N --> O[Partner profile]
  O --> P[Partner workspace]
~~~

## 7. UI wireframes

### Signup + AI assistant

~~~text
┌──────────────────────────────────────────────────────────────┐
│ MDE Partner signup                         [Venue] [Broker]  │
│ 1 Business name  [___________________________]               │
│ 2 Website        [https://example.com      ] [Find details]  │
│ 3 AI suggestions (source: partner website)                   │
│    Category: Café        [Accept] [Edit] [Ignore]            │
│    Description: ...      [Accept] [Edit] [Ignore]            │
│    Unknown fields stay blank — never invented                │
│ 4 [Create partner profile]   error → readable message        │
│    saved → Reference: <real partner id>                      │
└──────────────────────────────────────────────────────────────┘
390px: single column, sticky primary action, no horizontal scroll.
~~~

### Partner dashboard

~~~text
┌──────────────────────────────────────────────────────────────┐
│ MDE Partner Workspace        Café · Laureles     [Account]    │
│ Profile [Edit]   Leads [12]   Listings [3]   Assistant [Ask] │
├──────────────────────────────┬───────────────────────────────┤
│ Business profile             │ Assistant                     │
│ Name / Category / Hours      │ "Summarize my new leads"      │
│ Description / Website        │ grounded answer + source rows │
│ [Save] real receipt          │ tool action requires approval │
├──────────────────────────────┴───────────────────────────────┤
│ Recent leads (server-authorized; no other partner data)      │
└──────────────────────────────────────────────────────────────┘
~~~

## 8. Risk register

| Risk | Impact | Likelihood | Evidence | Mitigation | Owner |
| -- | -- | -- | -- | -- | -- |
| Duplicate venue leads | Lost trust, wrong CRM counts | High before fix | Route had no idempotency | UUID PK + fingerprint + 409 + tests | SAN-882 (this PR) |
| Guest form abuse | DB spam/cost | Medium | No limiter before fix | Durable check_rate_limit 12/h, fail closed | SAN-882 |
| PII in logs | Privacy exposure | High before fix | Email logged | Log id/type only; test asserts absence | SAN-882 |
| Partner agent over-permission | Cross-partner data leak | Medium | No partner tools yet | Server-derived identity; negative tests | SAN-706 |
| AI invents facts | Misleading profile | Medium | No eval harness | Typed proposals + SAN-1428 corpus | SAN-1428 |
| Duplicate agent/profile systems | Maintenance/divergence | Medium | New work not yet built | One agent, one profile owner, reuse ladder | SAN-705/814 |
| Staged deploy looks live | Old code serves | Medium (observed #371) | READY vs PROMOTED gap | Verify promoted target, not just READY | SAN-1360 |

## 9. Official references (source receipts)

- https://github.com/amoai-tech/mdeai/blob/main/src/app/api/partners/contact-leads/route.ts — ADAPT: UUID PK + fingerprint replay + 409 + check_rate_limit. Destination: src/app/api/partners/venue-leads/route.ts. Verification: 13 focused tests + live DB replay/409.
- https://supabase.com/docs/guides/database/postgres/row-level-security — REFERENCE ONLY: confirms RLS is the boundary; existing leads/partners policies were inspected, not changed.
- https://mastra.ai/docs/server/request-context — MODEL (planned SAN-705): derive partner identity server-side in tools; not yet implemented.
- https://ai.google.dev/gemini-api/docs/url-context — MODEL (planned SAN-1193): URL context with explicit sourced fields; not yet implemented.
- https://react.dev/reference/react/useSyncExternalStore — ADAPT (merged #391, reused here): hydration gate for public forms.

## 10. Phase A vs public launch

**Phase A (now):** inquiry reliability, shared agent, editable suggestions, profile persistence, rental draft/resume. No approval or ownership paperwork gates.

**Phase B (later, explicitly requested):** real ownership/agency authority, photo/viewing rights, publication eligibility, paid certification, global production certification. Do not impose these now.

## 11. Scores (criteria + proof)

| Area | Score | Basis |
| -- | -- | -- |
| Architecture correctness | 55/100 | One app/runtime and reusable shells; missing partner agent/profile/dashboard; no duplicate systems introduced |
| Frontend / UI/UX | 60/100 | Landings, signup, contact and inquiry work; no dashboard/profile; hydration defects fixed on two public forms |
| Backend / Supabase | 62/100 | Partner/lead tables + RLS verified; activation/lead APIs; profile update missing; venue lead hardened |
| CopilotKit/Mastra/Gemini | 30/100 | Runtime exists; no partnerAgent, no suggestion bridge, no URL extraction |
| End-to-end journeys | 40/100 | Venue/contact inquiry + receipts proven; signup activation partial; AI/profile/rental dashboard unproven |
| Test coverage/reliability | 65/100 | Repository floor green; focused API/form tests added; thin partner-journey E2E |
| Phase A development readiness | 45/100 | Core lead path now reliable; AI/profile/dashboard still missing |
| Public production readiness | 25/100 | Not requested; no launch certification, ownership rights or global journey certification |

## 12. This PR — SAN-882 evidence

- First submit → 200, leads.id = request id; replay identical → 200 replayed:true, one row; changed payload → 409; invalid → 400; limiter denial → 429; limiter outage → 503; DB client missing → 503.
- Live local DB verification: one row 72076084-... (intent=host, idempotency_key=id, source_page=venues-landing), replay/conflict correct, then deleted.
- Browser: form submit → 200, receipt equals lead id, row verified and removed; 390px no overflow.
- Route logs id + type only; a test asserts email/name/message never appear in logs.
- No migration, no new table, no new service.

Pending: npm run floor, exact-head CI, PR review/merge.
