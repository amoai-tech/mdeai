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

| Capability | Current MDE | Reference | What the reference teaches | What MDE should do | Real MDE example | Action | Phase |
|---|---|---|---|---|---|---|---|
| Structured rental search | `src/mastra/tools/search-rentals.ts` queries active `apartments` with neighborhood, bedrooms, price and dates | Dubai Real Estate — https://github.com/nazsats/dubai-real-estate | Deterministic filters belong in the database before AI/RAG ranking | Keep MDE's Supabase search; strengthen hard-filter correctness before semantic ranking | “2BR under COP 5M available Oct 1” must be filtered in SQL first | `KEEP + MODEL` | Core |
| Search ranking | MDE has intelligent/hybrid rental search plus structured fallback | HomeRecoEngine — https://github.com/yuehong136/HomeRecoEngine | Combine structured, semantic and location signals | Keep one MDE search pipeline; rank only the SQL-eligible set with geo/vector/signals | “Quiet near cafés but away from nightlife” ranks valid listings by fit | `KEEP + MODEL` | MVP |
| Cards + map state | MDE already has rental cards, pin conversion, browse state and map verification | CopilotKit Mastra Canvas — https://github.com/CopilotKit/CopilotKit/tree/main/examples/canvas/mastra | One shared state contract should drive AI, cards and map | Adapt shared-state ideas only where current MDE state is duplicated or inconsistent | “Only Laureles under COP 5M” updates filters, cards and pins together | `ADAPT` | MVP |
| Structured AI UI | MDE already renders rental results/cards | CopilotKit Generative UI — https://github.com/CopilotKit/CopilotKit/tree/main/examples/showcases/generative-ui | AI should emit typed data rendered by fixed application components | Keep MDE components and strengthen typed tool/result rendering | Three matches appear as consistent cards rather than prose | `ADAPT` | MVP |
| CopilotKit ↔ Mastra runtime | Existing MDE runtime already connects agents/tools to the application | CopilotKit Mastra integration — https://github.com/CopilotKit/CopilotKit/tree/main/examples/integrations/mastra | First-party integration patterns are the comparison baseline | Keep current runtime unless a verified parity gap exists | Rental agent calls existing `search-rentals` and streams results | `KEEP + REFERENCE` | Core |
| Rental agent | `src/mastra/agents/rental-agent.ts` owns rental-specific conversation/search behavior | `neoxu999/real-estate-agent` — https://github.com/neoxu999/real-estate-agent | Separate responsibilities clearly; not every behavior needs its own agent | Keep one rental agent plus deterministic tools/workflows | Search stays a tool; viewing commit stays a backend transaction | `KEEP + MODEL` | Core |
| Lifestyle preference ranking | Rental agent already recognizes use cases such as quiet/remote-work/family and search results expose tags/signals | HomeMatch — https://github.com/GretaGalliani/HomeMatch | Soft preferences can improve ranking after hard filters | Add preference ranking only after eligibility is correct | “Quiet, fast Wi-Fi, walkable” changes ordering, not eligibility | `MODEL` | MVP |
| Viewing request | Existing `p1_schedule_tour_atomic` RPC and related migrations provide an atomic foundation | Real Estate AI Chatbot — https://github.com/JoaoVitorCarvalhoPR/real-estate-ai-chatbot | Conversational qualification should hand off into a deterministic human/business flow | Keep MDE atomic RPC; make UI/AI confirmation depend on the committed result | User confirms a viewing; MDE writes once, then shows truthful confirmation | `KEEP + MODEL` | Core |
| Broker handoff | MDE has `/host/rentals` broker routes and current lead/showing data work | Real Estate AI Chatbot — https://github.com/JoaoVitorCarvalhoPR/real-estate-ai-chatbot | AI can qualify intent before human follow-up | Route committed leads/showings only to authorized broker/owner views | Broker sees the lead for a listing they are authorized to manage | `KEEP + MODEL` | MVP |
| Supabase as listing truth | Current MDE uses Supabase `apartments` and related rental tables | External real-estate repos use varied data stacks | A useful reference does not justify another source of truth | Keep Supabase/Postgres as canonical listing/ownership/transaction truth | A card, agent answer and broker workspace refer to the same apartment row | `KEEP` | Core |
| RLS / ownership | Current MDE uses Supabase auth/RLS and has dedicated ownership hardening tasks | Supabase RLS — https://supabase.com/docs/guides/database/postgres/row-level-security | Authorization belongs at the data boundary, not only in AI prompts/UI | Keep and strengthen RLS/ownership proof with two-user negative tests | Broker B cannot open Broker A's private lead/showing | `KEEP` | Core |

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
