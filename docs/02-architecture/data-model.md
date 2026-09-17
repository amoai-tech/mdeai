# MDE AI — Data Model and Live Supabase ERDs

This document describes the **current MDE AI data architecture** using the live Supabase project and merged GitHub `main` as evidence.

## Source of truth

Data-model claims are verified in this order:

1. live Supabase project `zkwcbyxiwklihegjhuql` (`medellin`);
2. merged GitHub `main` migrations and application code;
3. current tests and runtime contracts;
4. Linear only for planned work and execution status.

Verified live project:

- project ref: `zkwcbyxiwklihegjhuql`;
- project name: `medellin`;
- status: `ACTIVE_HEALTHY`;
- Postgres: 17.6;
- region: `us-east-1`.

The diagrams intentionally show **logical product domains**, not every table in the database. Large infrastructure/support tables are documented where they affect architecture but omitted from domain ERDs when they would make the diagram unreadable.

Mermaid reference: https://mermaid.ai/open-source/intro/

---

## 1. Domain Data Map

```mermaid
flowchart LR
    PROFILE[Profiles / identity]

    subgraph DISCOVERY[Discovery]
        EVENTS[Events]
        REST[Restaurants]
        VENUES[Venue anchors]
        APTS[Apartments]
    end

    subgraph INTEL[Intelligence]
        EMB[Embeddings]
        SIGNALS[Signals]
        GROUND[Grounding evidence]
        SEARCH[Search logs / caches]
    end

    subgraph ACTIONS[Actions]
        LEADS[Leads]
        SHOW[Showings]
        BOOKINGS[Bookings]
        VREQ[Venue booking requests]
        ORDERS[Event orders]
    end

    subgraph PERSONAL[Personal context]
        TRIPS[Trips]
        SAVED[Saved places]
        COLLECTIONS[Collections]
        PREFS[User preferences]
    end

    subgraph AI[AI runtime persistence]
        AIRUNS[AI runs]
        THREADS[Mastra threads/messages]
        TRACE[Mastra spans/scorers]
        APPROVALS[Approval requests]
        OUTBOX[Outbox]
    end

    PROFILE --> PREFS
    PROFILE --> TRIPS
    PROFILE --> COLLECTIONS
    PROFILE --> LEADS
    PROFILE --> BOOKINGS
    PROFILE --> AIRUNS

    EVENTS --> EMB
    REST --> EMB
    APTS --> EMB
    EVENTS --> SIGNALS
    REST --> SIGNALS
    VENUES --> SIGNALS
    APTS --> SIGNALS
    EVENTS --> GROUND
    APTS --> GROUND

    APTS --> LEADS
    LEADS --> SHOW
    EVENTS --> ORDERS
    REST --> VREQ
    VENUES --> VREQ

    TRIPS --> SAVED
    TRIPS --> BOOKINGS
    TRIPS --> ORDERS
    TRIPS --> SHOW

    APPROVALS --> OUTBOX
```

This diagram shows the core pattern:

> **canonical entities → intelligence/evidence → user actions → persistent context → AI/operational audit**

---

## 2. Events and Ticket Commerce ERD

```mermaid
erDiagram
    PROFILES ||--o{ EVENTS : organizes
    PROFILES ||--o{ EVENT_VENUES : owns
    EVENT_VENUES ||--o{ EVENTS : hosts

    EVENTS ||--o{ EVENT_TICKETS : offers
    EVENTS ||--o{ EVENT_ORDERS : receives
    EVENT_TICKETS ||--o{ EVENT_ORDERS : purchased_as

    EVENT_ORDERS ||--o{ EVENT_ATTENDEES : contains
    EVENTS ||--o{ EVENT_ATTENDEES : admits
    EVENT_TICKETS ||--o{ EVENT_ATTENDEES : grants

    EVENT_ATTENDEES ||--o{ EVENT_CHECK_INS : scanned_as
    EVENTS ||--o{ EVENT_CHECK_INS : records

    EVENT_ORDERS o|--o| PAYMENTS : settles
    EVENTS ||--o{ EVENT_EMBEDDINGS : embedded_as
    EVENTS ||--o{ EVENT_SIGNALS : scored_as
    EVENTS ||--o{ EVENT_GROUNDING : supported_by

    EVENTS {
        uuid id PK
        uuid organizer_id FK
        uuid venue_id FK
        text slug
        text status
        timestamptz event_start_time
    }

    EVENT_TICKETS {
        uuid id PK
        uuid event_id FK
        int price_cents
        int qty_total
        int qty_sold
        int qty_pending
    }

    EVENT_ORDERS {
        uuid id PK
        uuid event_id FK
        uuid ticket_id FK
        uuid payment_id FK
        text status
        int total_cents
        text stripe_session_id
    }

    EVENT_ATTENDEES {
        uuid id PK
        uuid order_id FK
        uuid ticket_id FK
        uuid event_id FK
        text qr_token
        text status
    }

    PAYMENTS {
        uuid id PK
        uuid event_order_id FK
        text stripe_payment_intent_id
        text status
        numeric amount
    }
```

### Event commerce invariants

- `event_tickets` belong to one event.
- `event_orders` reference both the event and ticket tier.
- `event_attendees` are generated from an order and carry the QR identity.
- `event_check_ins` provide the scan/audit trail.
- `payments` can reference an event order.
- inventory tracks both sold and pending quantities.
- final payment state must come from trusted backend/provider confirmation, not the browser.

---

## 3. Rental Marketplace ERD

```mermaid
erDiagram
    LANDLORD_PROFILES ||--o{ APARTMENTS : owns
    PROFILES ||--o{ LEADS : creates
    PROFILES ||--o{ LEADS : assigned_to
    NEIGHBORHOODS ||--o{ LEADS : preferred_area

    APARTMENTS ||--o{ LEADS : interests
    LEADS ||--o{ SHOWINGS : schedules
    APARTMENTS ||--o{ SHOWINGS : shown_at

    LEADS ||--o{ RENTAL_APPLICATIONS : leads_to
    APARTMENTS ||--o{ RENTAL_APPLICATIONS : applied_for
    PROFILES ||--o{ RENTAL_APPLICATIONS : applicant

    APARTMENTS ||--o{ LISTING_EMBEDDINGS : embedded_as
    APARTMENTS ||--o{ RENTAL_SIGNALS : scored_as
    APARTMENTS ||--o{ RENTAL_GROUNDING : supported_by
    APARTMENTS ||--o{ RENTAL_LISTING_IMAGES : has

    PARTNERS ||--o{ LEADS : receives
    PARTNERS o|--o| LANDLORD_PROFILES : bridges_to

    APARTMENTS {
        uuid id PK
        uuid landlord_id FK
        uuid host_id
        text title
        text neighborhood
        numeric price_monthly
        text listing_workflow_status
        text freshness_status
    }

    LEADS {
        uuid id PK
        uuid user_id FK
        uuid apartment_id FK
        uuid assigned_agent_id FK
        uuid partner_id FK
        uuid trip_id FK
        text intent
        text pipeline_stage
    }

    SHOWINGS {
        uuid id PK
        uuid lead_id FK
        uuid apartment_id FK
        uuid trip_id FK
        timestamptz scheduled_at
        text status
    }

    RENTAL_APPLICATIONS {
        uuid id PK
        uuid lead_id FK
        uuid apartment_id FK
        uuid applicant_id FK
        text status
    }
```

### Rental data flow

```mermaid
sequenceDiagram
    actor Renter
    participant UI as Rentals UI / Chat
    participant AI as CopilotKit + Mastra
    participant Search as Rental search workflow
    participant DB as Supabase
    participant Maps as Maps / Places
    participant Lead as Lead / showing write path

    Renter->>UI: Describe rental need
    UI->>AI: Intent + filters + current map state
    AI->>Search: Structured rental search
    Search->>DB: Query apartments + signals + embeddings
    DB-->>Search: Ranked candidate data
    Search-->>AI: Structured results
    AI-->>UI: Cards + explanation
    UI->>Maps: Render listing pins
    Renter->>UI: Select listing / request viewing
    UI->>Lead: Submit validated lead request
    Lead->>DB: Create lead idempotently
    Renter->>UI: Choose viewing time
    UI->>Lead: Create showing
    Lead->>DB: Link showing to lead + apartment
```

---

## 4. Trips, Saved Context, and Bookings ERD

```mermaid
erDiagram
    PROFILES ||--o{ TRIPS : owns
    PROFILES ||--o{ COLLECTIONS : owns
    PROFILES ||--o{ SAVED_PLACES : saves

    TRIPS ||--o{ TRIP_ITEMS : contains
    TRIPS ||--o{ SAVED_PLACES : groups
    COLLECTIONS ||--o{ SAVED_PLACES : groups

    TRIPS ||--o{ BOOKINGS : includes
    PROFILES ||--o{ BOOKINGS : makes
    PARTNERS ||--o{ BOOKINGS : fulfills

    TRIPS ||--o{ EVENT_ORDERS : contains
    TRIPS ||--o{ SHOWINGS : contains
    TRIPS ||--o{ LEADS : contextualizes

    TRIPS {
        uuid id PK
        uuid user_id FK
        text title
        date start_date
        date end_date
        text status
    }

    TRIP_ITEMS {
        uuid id PK
        uuid trip_id FK
        text item_type
        uuid source_id
        text title
    }

    SAVED_PLACES {
        uuid id PK
        uuid user_id FK
        uuid trip_id FK
        uuid collection_id FK
        text location_type
        uuid location_id
    }

    BOOKINGS {
        uuid id PK
        uuid user_id FK
        uuid trip_id FK
        uuid partner_id FK
        text booking_type
        text status
        text payment_status
    }
```

This is the persistent context layer that lets MDE move from one-off discovery toward ongoing planning.

---

## 5. Partners and Venue Supply ERD

```mermaid
erDiagram
    PROFILES ||--o{ PARTNERS : owns
    PARTNER_ORGANIZATIONS ||--o{ PARTNERS : groups
    PARTNERS ||--o{ PARTNER_MEMBERS : has
    PROFILES ||--o{ PARTNER_MEMBERS : joins
    PARTNERS ||--o{ PARTNER_LOCATIONS : operates
    PARTNERS ||--o{ PARTNER_SERVICES : enables
    PARTNERS ||--o{ LEADS : receives
    PARTNERS ||--o{ BOOKINGS : fulfills

    PARTNER_LOCATIONS ||--o{ VENUE_EVENT_OFFERINGS : offers
    PARTNER_LOCATIONS ||--o{ VENUE_EVENT_PACKAGES : packages

    RESTAURANTS ||--o{ VENUE_BOOKING_REQUESTS : requested_for
    VENUE_ANCHORS ||--o{ VENUE_BOOKING_REQUESTS : requested_for

    PARTNERS {
        uuid id PK
        uuid profile_id FK
        uuid organization_id FK
        text type
        text status
        int completion_score
    }

    PARTNER_MEMBERS {
        uuid partner_id PK, FK
        uuid profile_id PK, FK
        text role
    }

    PARTNER_LOCATIONS {
        uuid id PK
        uuid partner_id FK
        text address
        text neighborhood
        float lat
        float lng
        boolean accepts_event_bookings
    }

    VENUE_BOOKING_REQUESTS {
        uuid id PK
        uuid restaurant_id FK
        uuid venue_anchor_id FK
        int party_size
        timestamptz requested_at
        text status
    }
```

---

## 6. AI, Search, Embeddings, and Observability

The live database already contains an active intelligence layer.

Current examples:

- `listing_embeddings` → `apartments`;
- `event_embeddings` → `events`;
- `restaurant_embeddings` → `restaurants`;
- `event_signals`, `rental_signals`, `venue_signals`;
- `event_grounding`, `rental_grounding`, `venue_source_evidence`;
- `search_logs`, `grounding_failures`, `query_embedding_cache`;
- `embedding_jobs`;
- `ai_runs`;
- Mastra thread/message/span/scorer/workflow persistence tables.

### Intelligence data flow

```mermaid
flowchart LR
    QUERY[User query]
    NORMALIZE[Intent + slots]
    CACHE[Query embedding cache]
    EMBED[Gemini embedding]

    subgraph ENTITIES[Canonical entities]
        EVENTS[Events]
        APTS[Apartments]
        REST[Restaurants]
        VEN[Venue anchors]
    end

    subgraph INTEL[Intelligence sidecars]
        VECS[Embedding tables]
        SIGNALS[Signal tables]
        EVIDENCE[Grounding evidence]
    end

    HYBRID[Hybrid retrieval / ranking]
    RESULT[Structured ranked results]
    LOG[Search logs / AI runs]

    QUERY --> NORMALIZE
    NORMALIZE --> CACHE
    CACHE -->|miss| EMBED
    EMBED --> HYBRID
    CACHE -->|hit| HYBRID

    EVENTS --> VECS
    APTS --> VECS
    REST --> VECS
    VEN --> SIGNALS
    EVENTS --> SIGNALS
    APTS --> SIGNALS
    REST --> SIGNALS

    VECS --> HYBRID
    SIGNALS --> HYBRID
    EVIDENCE --> HYBRID
    HYBRID --> RESULT
    RESULT --> LOG
```

### Important correction to older planning assumptions

pgvector/semantic retrieval is **not merely a future concept**. Live Supabase already contains vector-backed embedding tables for apartments, events, and restaurants, plus query embedding cache and embedding job infrastructure.

The roadmap may still contain **future expansion** of semantic personalization, but the base vector-search infrastructure exists today.

---

## 7. AI Runtime Persistence

```mermaid
flowchart TD
    REQUEST[CopilotKit request]
    CTX[Mastra RequestContext]
    AGENT[Agent / workflow]
    THREAD[mastra_threads]
    MSG[mastra_messages]
    SPAN[mastra_ai_spans]
    SCORE[mastra_scorers]
    RUN[ai_runs]
    SNAP[mastra_workflow_snapshot]

    REQUEST --> CTX
    CTX --> AGENT
    AGENT --> THREAD
    THREAD --> MSG
    AGENT --> SPAN
    SPAN --> SCORE
    AGENT --> RUN
    AGENT --> SNAP
```

This persistence supports conversation continuity, workflow state, tracing, scoring, cost/performance analysis, and production debugging.

---

## 8. Human Approval and Outbox ERD

```mermaid
erDiagram
    APPROVAL_REQUESTS ||--o{ APPROVAL_DECISIONS : records
    APPROVAL_REQUESTS o|--o| OUTBOX : gates

    APPROVAL_REQUESTS {
        uuid id PK
        text agent
        text action_type
        text risk_level
        text status
        uuid outbox_id FK
    }

    APPROVAL_DECISIONS {
        uuid id PK
        uuid request_id FK
        text decision
        uuid decided_by
    }

    OUTBOX {
        uuid id PK
        uuid approval_id FK
        text channel
        text action
        text idempotency_key
        text status
    }
```

### Approval / side-effect data flow

```mermaid
sequenceDiagram
    participant Agent
    participant App as MDE backend
    participant Approval as approval_requests
    actor Human
    participant Outbox
    participant External as External provider

    Agent->>App: Propose consequential action
    App->>Approval: Create pending approval
    Approval-->>Human: Present action + risk/context
    Human->>Approval: Approve / reject / request changes
    alt approved
        Approval->>Outbox: Release approved work
        Outbox->>External: Perform side effect
        External-->>Outbox: Provider result
    else rejected or expired
        Approval-->>App: No external side effect
    end
```

The architectural rule is:

> **AI may propose; authorization, approval, validation, and side effects remain deterministic.**

---

## 9. RLS and Security Boundary

Core MDE product tables inspected in the live project use RLS, including profiles, events, restaurants, apartments, leads, payments, event commerce, partner, trip, booking, intelligence, approval, and Mastra persistence tables.

Supabase security principle:

```text
Auth = who is the caller?
RLS = which rows may the caller access?
Server/tool validation = is this transition valid?
AI = never an authorization boundary
```

### Live schema drift warning

The live `public` schema also contains several `fashionos_*` tables that are outside the canonical MDE product model. At verification time, those tables had RLS disabled. They are intentionally excluded from these MDE ERDs.

This should be treated as **database/schema security drift requiring separate review**, not as part of MDE's canonical architecture. Do not blindly enable RLS without defining the intended access policies because that can break existing consumers.

---

## 10. ERD Maintenance Rules

1. Generate relationships from live foreign keys or merged migrations — never from the PRD alone.
2. Keep domain ERDs focused; do not create one unreadable diagram containing every table.
3. Use real cardinality only where the schema supports it.
4. Mark polymorphic references such as `saved_places.location_id` or `trip_items.source_id` as application-level references rather than pretending they are database FKs.
5. Keep vector/signal/evidence sidecars separate from canonical entity ownership.
6. Re-check the live schema before major documentation releases.
7. Treat RLS and authorization as architecture, not implementation detail.

## Related docs

- [`system-overview.md`](system-overview.md) — system/runtime architecture
- [`README.md`](README.md) — architecture index
- [`../../prd.md`](../../prd.md) — product requirements
- [`../../roadmap.md`](../../roadmap.md) — product strategy
- Mermaid ER diagrams: https://mermaid.ai/open-source/syntax/entityRelationshipDiagram.html
