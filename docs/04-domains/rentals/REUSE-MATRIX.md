# MDE Rentals — Reuse Matrix

**Purpose:** decide what MDE Rentals should keep, adapt, model, reference, or skip.

**Core/MVP rule:** use the smallest proven pattern that completes the renter → listing → viewing → broker journey. Advanced agent infrastructure is not an MVP requirement.

## Task 1 · Decision legend

| Action | Meaning |
|---|---|
| `KEEP` | Current MDE is already the right solution. Improve it instead of replacing it. |
| `ADAPT` | Reuse a specific proven pattern, changed to fit MDE. |
| `MODEL` | Learn from the architecture/product idea only. |
| `REFERENCE` | Useful source material; not an implementation authority. |
| `SKIP` | Not appropriate for the current MDE phase. |

`COPY` is intentionally avoided in this MVP matrix unless source code, license, version compatibility, and tests are all verified first.

---

## Task 2 · Core/MVP reuse decisions

The evidence columns below implement the schema required by the archived implementation plan. `MODEL` references are intentionally not approved for source reuse; they must be pinned and license-checked before any future task upgrades them to `ADAPT` or `COPY`.

| Capability | Current MDE | Reference | Full URL | Version/commit | License | What the repo demonstrates | Exact pattern to adapt | Exact MDE destination | Real-world MDE example | Do not copy | Action | Verification | Journey | Phase |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Structured rental search | `src/mastra/tools/search-rentals.ts` + Supabase | Dubai Real Estate | https://github.com/nazsats/dubai-real-estate | Not pinned — MODEL only | Not verified for reuse | Deterministic filters before AI/RAG ranking | SQL hard-filter boundary only | Existing rental search/Supabase query path | “2BR under COP 5M available Oct 1” is filtered in SQL first | External storage/runtime architecture | `KEEP + MODEL` | Planning reference only; no source reuse approved | Find a rental | Core |
| Search ranking | Existing hybrid rental search | HomeRecoEngine | https://github.com/yuehong136/HomeRecoEngine | Not pinned — MODEL only | Not verified for reuse | Structured + semantic + location signals | Rank only the SQL-eligible set | Existing rental search engine + verified geo/vector/signals | Quiet near cafés but away from nightlife ranks valid listings | A second listing/search database | `KEEP + MODEL` | Planning reference only; no source reuse approved | Compare rentals | MVP |
| Cards + map state | Existing cards, pins, browse state | CopilotKit Mastra Canvas | https://github.com/CopilotKit/CopilotKit/tree/5eec9b0d025cc8c84558145be6ebbeaa7e2321fa/examples/canvas/mastra | `5eec9b0d025cc8c84558145be6ebbeaa7e2321fa` | MIT | Shared application/AI state | Shared selected-listing/filter/map contract | Existing rental cards, map state, CopilotKit UI | A filter change updates cards and pins together | Example auth, routing, Supabase/runtime | `ADAPT` | Path + MIT license verified at pinned SHA; package compatibility required before source reuse | Explore the map | MVP |
| Structured AI UI | Existing rental result/card rendering | CopilotKit Generative UI | https://github.com/CopilotKit/CopilotKit/tree/5eec9b0d025cc8c84558145be6ebbeaa7e2321fa/examples/showcases/generative-ui | `5eec9b0d025cc8c84558145be6ebbeaa7e2321fa` | MIT | Typed AI results rendered as fixed components | Typed result-to-component pattern | Existing rental card/tool-result surfaces | Three matches render as consistent cards | Generated UI as authorization for writes | `ADAPT` | Path + MIT license verified at pinned SHA; package compatibility required before source reuse | Compare rentals | MVP |
| CopilotKit ↔ Mastra runtime | Existing MDE runtime | CopilotKit Mastra integration | https://github.com/CopilotKit/CopilotKit/tree/5eec9b0d025cc8c84558145be6ebbeaa7e2321fa/examples/integrations/mastra | `5eec9b0d025cc8c84558145be6ebbeaa7e2321fa` | MIT | First-party integration wiring | Only a proven missing wiring pattern | Existing CopilotKit route + Mastra bridge | Rental agent streams structured search results | Replacing a working runtime without parity proof | `KEEP + REFERENCE` | Path + MIT license verified; remain REFERENCE until a concrete gap is proven | Ask about a rental | Core |
| Rental agent | `src/mastra/agents/rental-agent.ts` | neoxu999 real-estate-agent | https://github.com/neoxu999/real-estate-agent | Not pinned — MODEL only | Not verified for reuse | Clear agent/tool responsibility boundaries | Responsibility separation concept | Existing rental agent + deterministic tools/workflows | Search stays a tool; commit stays backend transaction | External agent/runtime architecture | `KEEP + MODEL` | Planning reference only; no source reuse approved | Ask about a rental | Core |
| Lifestyle preference ranking | Existing rental preferences/tags/signals | HomeMatch | https://github.com/GretaGalliani/HomeMatch | Not pinned — MODEL only | Not verified for reuse | Soft preference semantic ranking | Rank after hard eligibility filters | Existing preference/result ranking path | “Quiet, fast Wi-Fi, walkable” changes order, not eligibility | Semantic matching as sole filter | `MODEL` | Planning reference only; no source reuse approved | Compare rentals | MVP |
| Viewing request | Existing `p1_schedule_tour_atomic` RPC | Real Estate AI Chatbot | https://github.com/JoaoVitorCarvalhoPR/real-estate-ai-chatbot | Not pinned — MODEL only | Not verified for reuse | Conversation → qualified human handoff | Product handoff pattern only | Existing viewing/lead flow + atomic RPC | Confirm → authorize → commit → show success | Any path bypassing MDE auth/RLS/atomic write | `KEEP + MODEL` | Planning reference only; no source reuse approved | Request a viewing | Core |
| Broker handoff | `/host/rentals` + lead/showing work | Real Estate AI Chatbot | https://github.com/JoaoVitorCarvalhoPR/real-estate-ai-chatbot | Not pinned — MODEL only | Not verified for reuse | AI qualification before broker follow-up | Product handoff pattern only | Existing authorized broker workspace | Authorized broker sees committed lead | Vendor/channel assumptions or auth bypass | `KEEP + MODEL` | Planning reference only; no source reuse approved | Broker follow-up | MVP |
| Supabase as listing truth | Existing `apartments` + rental tables | Current MDE architecture | https://github.com/amoai-tech/mdeai | MDE `main` | N/A — internal MDE source | One canonical listing/transaction source | Keep current canonical data boundary | Supabase/Postgres rental tables | Card, agent, and broker view use same apartment row | A second source of listing truth | `KEEP` | Current MDE source; verify against merged main/live DB in implementation tasks | All rental journeys | Core |
| RLS / ownership | Existing Supabase auth/RLS | Supabase RLS docs | https://supabase.com/docs/guides/database/postgres/row-level-security | Docs reference | N/A — documentation reference | Authorization at the data boundary | Two-user negative RLS proof | Existing rental RLS/ownership policies + tests | Broker B cannot read Broker A lead/showing | Prompt/UI-only authorization | `KEEP` | Official documentation reference; runtime proof remains MDE-specific | Manage rentals | Core |

---

## Task 3 · Current MDE problems to fix before adding more intelligence

These are more important than adding new AI features.

### 3.1 Production search must not silently become demo search

Current `search-rentals.ts` falls back to `MOCK_RENTALS` when Supabase fails.

That is useful for local/offline development, but dangerous as a production truth path.

**Real-world failure:**

> A user asks for an apartment available next month. Supabase is unavailable. MDE silently shows demo apartments and the user thinks they are real current inventory.

**Required direction:** production must fail visibly/degrade safely rather than present mock inventory as live inventory.

### 3.2 Rental agent instructions contradict the tool

Current rental-agent instructions say:

> “Mock data is the only truth.”

But the current search tool explicitly queries live Supabase first and uses mock data only as fallback.

**Required direction:** update the agent contract when implementation work is scheduled so it treats verified Supabase results as truth and never invents listings.

### 3.3 Atomic viewing exists but the product path must prove it actually uses it

The database already contains `p1_schedule_tour_atomic`, but a strong database primitive is not enough if UI/Edge/API flows bypass it.

**Required direction:** one committed viewing path, idempotent/concurrency-tested, with confirmation only after commit.

### 3.4 Ownership must be complete before broker automation

Do not add proactive broker agents until listing ownership, RLS and broker A/B access proof are green.

---

## Task 4 · Advanced references — defer by default

| Reference/capability | Potential use | Decision for Core/MVP |
|---|---|---|
| Mastra Deep Search — https://github.com/mastra-ai/template-deep-search | deep neighborhood/market research | `MODEL / DEFER` |
| Mastra Browsing Agent — https://github.com/mastra-ai/template-browsing-agent | external listing/source verification | `MODEL / DEFER` |
| Mastra Agent Harness — https://github.com/mastra-ai/template-agent-harness | broker coworker/tasks/approvals | `MODEL / DEFER` |
| Mastra Company Knowledge — https://github.com/mastra-ai/template-company-knowledge | building/broker knowledge | `MODEL / DEFER` |
| MCP | external tool ecosystems | `REFERENCE / DEFER` |
| A2A / agent network | multi-agent interoperability | `REFERENCE / DEFER` |
| Observational memory | long-lived personalization | `REFERENCE / DEFER` until identity/durability is proven |
| Browser agents | autonomous external browsing | `REFERENCE / DEFER` |
| Schedules/background agents | proactive broker operations | `REFERENCE / DEFER` |

### Simple rule

> If the MVP can be solved with one rental agent, typed tools, Supabase and deterministic workflows, do that first.

---

## Task 5 · Reuse examples in plain English

### Example A · Hard filters before AI

**Reference:** Dubai Real Estate.

**Adapt:** the boundary between deterministic database truth and semantic reasoning.

**MDE:**

```text
User: “2BR under COP 5M in Laureles”
→ SQL removes listings over budget / wrong bedroom count / wrong area
→ semantic ranking orders the valid set
→ AI explains the top matches
```

AI may rank. AI may explain. AI may not override hard constraints.

### Example B · One map/card/AI state

**Reference:** CopilotKit Mastra Canvas.

**Adapt:** shared state pattern.

**MDE:**

```text
User selects a rental pin
→ same listing becomes selected in the card list
→ AI knows which listing is selected
→ “schedule this one” refers to that exact listing
```

### Example C · Viewing confirmation only after commit

**Reference:** conversational lead-handoff patterns plus MDE's own atomic RPC.

**MDE:**

```text
User chooses listing + time
→ explicit confirmation
→ server authorizes
→ atomic RPC commits lead/showing
→ only then show “Viewing requested”
```

---

## Task 6 · References that must be pinned before implementation

Moving `main` URLs are acceptable in planning. Before a future implementation task uses code directly, record:

```text
Reference repo
Exact commit/tag
License
MDE package/version compatibility
Exact MDE files being changed
Tests proving the adaptation
```

Unknown or incompatible license means `MODEL`/`REFERENCE`, not `COPY`/`ADAPT` of source code.
