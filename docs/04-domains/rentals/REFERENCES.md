# MDE Rentals — Reference Index

**Purpose:** one easy-to-scan index of the repositories, templates, examples, and official docs that may inform MDE Rentals.

This file does **not** mean MDE should copy everything listed here.

Use this rule:

> **Current MDE first → official framework examples second → external real-estate repos only for proven patterns.**

For Core and MVP, prefer the smallest pattern that helps this journey:

```text
search
→ compare
→ map
→ listing
→ viewing request
→ broker follow-up
```

Advanced agent infrastructure is intentionally deferred.

---

## Task 1 · How to read this index

Each reference answers five questions:

1. **What does this repo demonstrate?**
2. **What should MDE adapt from it?**
3. **Where does that pattern fit in MDE?**
4. **What does that look like for a real MDE user?**
5. **What should MDE not copy?**

Classifications:

- `KEEP` — current MDE is already the right solution.
- `ADAPT` — reuse a specific proven pattern, changed for MDE.
- `MODEL` — learn from the design, but do not copy implementation directly.
- `REFERENCE` — useful source material only.
- `SKIP` — not appropriate for current MDE.

`COPY` is intentionally rare. It requires source inspection, compatible licensing, and version compatibility.

---

## Task 2 · Current MDE — check these first

| Source | URL | Why it matters |
|---|---|---|
| MDE repository | https://github.com/amoai-tech/mdeai | Current implementation truth |
| Rental docs | https://github.com/amoai-tech/mdeai/tree/main/docs/04-domains/rentals | Canonical rental documentation home |
| Rental search tool | https://github.com/amoai-tech/mdeai/blob/main/src/mastra/tools/search-rentals.ts | Existing rental search contract |
| Rental agent | https://github.com/amoai-tech/mdeai/blob/main/src/mastra/agents/rental-agent.ts | Existing rental AI responsibility |
| Rental search engine | https://github.com/amoai-tech/mdeai/blob/main/src/mastra/lib/rental-search-engine.ts | Existing search orchestration/dedupe path |
| Rental browse page | https://github.com/amoai-tech/mdeai/blob/main/src/app/rentals/page.tsx | Current consumer browse surface |
| Rental search API | https://github.com/amoai-tech/mdeai/blob/main/src/app/api/rentals/search/route.ts | Existing HTTP search path |
| Rental map-pin verification | https://github.com/amoai-tech/mdeai/blob/main/scripts/verify-rental-map-pins.mjs | Existing data-to-map proof |
| Supabase migrations | https://github.com/amoai-tech/mdeai/tree/main/supabase/migrations | Database/schema/function truth |
| Atomic tour RPC | https://github.com/amoai-tech/mdeai/blob/main/supabase/migrations/20260408120001_p1_schedule_tour_atomic_exact_slot_fix.sql | Existing atomic viewing foundation |

### What this means

Do not rebuild search, rental agents, map conversion, or transaction infrastructure merely because an external repo has another implementation.

External references should improve or clarify these existing MDE foundations.


### Reference repository inspection

Use the canonical repository URLs in this document as the portable source references. Local clones may be used for faster inspection, but their machine-specific paths are intentionally not part of the canonical documentation.

A local clone is convenient inspection evidence, not permission to copy code. Record the exact commit/tag and license before any direct adaptation.

---

## Task 3 · Core/MVP reference shortlist

These are the most useful references for the current rental MVP.

### 3.1 CopilotKit Mastra Canvas

**Repo/example:**
https://github.com/CopilotKit/CopilotKit/tree/main/examples/canvas/mastra

**Classification:** `ADAPT / MODEL`

**What it demonstrates:** shared state between AI and application UI.

**What MDE adapts:** one shared contract for rental filters, selected listing, selected map pin, map bounds, and shortlist state.

**MDE destination:** current CopilotKit rental/chat UI plus existing rental cards/map state.

**Real-world example:**

> A user says, “Only show Laureles apartments under COP 5M.”

The AI updates the filters. The cards and map immediately show the same filtered set. Selecting a pin updates the selected card, and the agent sees the same selection.

**Do not copy:** MDE auth, Supabase access, routing, and runtime should not be replaced by the example app.

---

### 3.2 CopilotKit Generative UI

**Repo/example:**
https://github.com/CopilotKit/CopilotKit/tree/main/examples/showcases/generative-ui

**Classification:** `ADAPT / MODEL`

**What it demonstrates:** typed AI results rendered as application components instead of plain prose.

**What MDE adapts:** structured `RentalCard`, rental comparison, approval, and recovery UI patterns.

**MDE destination:** existing rental result/card surfaces and CopilotKit tool rendering.

**Real-world example:**

> The rental agent finds three valid apartments.

Instead of replying with a paragraph, MDE shows three consistent cards with price, neighborhood, bedrooms, key amenities, and actions.

**Do not copy:** arbitrary generated UI must never authorize a viewing or other consequential write.

---

### 3.3 CopilotKit + Mastra integration

**Repo/example:**
https://github.com/CopilotKit/CopilotKit/tree/main/examples/integrations/mastra

**Classification:** `REFERENCE / ADAPT only if a verified gap exists`

**What it demonstrates:** first-party CopilotKit ↔ Mastra integration.

**What MDE adapts:** only wiring patterns that are stronger than or missing from the current MDE runtime.

**MDE destination:** existing CopilotKit route and Mastra bridge.

**Real-world example:**

> The user asks for an apartment. The existing MDE rental agent calls the existing rental search tool and streams structured results into the current chat UI.

**Do not copy:** do not replace the current MDE integration if a parity audit shows it already satisfies the same contract.

---

### 3.4 Dubai Real Estate

**Repo:**
https://github.com/nazsats/dubai-real-estate

**Classification:** `MODEL`

**Verification:** external domain reference; inspect exact commit/license before any code reuse.

**What it demonstrates:** deterministic database filtering should own numeric and factual constraints; semantic/RAG logic belongs after deterministic truth.

**What MDE adapts:** the boundary, not the app architecture.

**MDE destination:** `search-rentals` and the Supabase rental query path.

**Real-world example:**

> “I need a furnished 2-bedroom apartment under COP 5M, available October 1.”

MDE first enforces price, bedrooms, furnishing, and availability in SQL. Only eligible apartments continue to relevance ranking. AI can explain which eligible apartment fits best; it cannot reintroduce one over budget.

**Do not copy:** storage/runtime architecture or RAG for hard constraints.

---

### 3.5 HomeRecoEngine

**Repo:**
https://github.com/yuehong136/HomeRecoEngine

**Classification:** `MODEL`

**Verification:** external domain reference; inspect exact commit/license before any code reuse.

**What it demonstrates:** combine structured filters, semantic relevance, and geospatial context.

**What MDE adapts:** the ranking sequence.

**MDE destination:** Supabase filters + PostGIS/location logic + pgvector + `rental_signals` where verified.

**Real-world example:**

> “I want somewhere quiet, close to cafés, but not right beside nightlife.”

Hard constraints remove invalid listings. Location logic measures spatial fit. Semantic signals rank the remaining listings by lifestyle fit.

**Do not copy:** a second search database or another source of listing truth.

---

### 3.6 Real Estate AI Chatbot

**Repo:**
https://github.com/JoaoVitorCarvalhoPR/real-estate-ai-chatbot

**Classification:** `MODEL`

**Verification:** external domain reference; inspect exact commit/license before any code reuse.

**What it demonstrates:** conversational qualification followed by human handoff.

**What MDE adapts:** the product pattern: answer questions → collect intent → create a qualified lead/showing → route to the authorized broker.

**MDE destination:** rental viewing/lead flow and broker workspace.

**Real-world example:**

> A renter asks about a listing, confirms budget and move-in date, then requests a viewing. MDE records the request once and makes it visible only to the authorized broker/owner.

**Do not copy:** vendor/channel assumptions or any path that bypasses MDE RLS, authorization, or explicit approval.

---

### 3.7 HomeMatch

**Repo:**
https://github.com/GretaGalliani/HomeMatch

**Classification:** `MODEL`

**Verification:** external domain reference; inspect exact commit/license before any code reuse.

**What it demonstrates:** extract soft lifestyle preferences and use them for semantic ranking.

**What MDE adapts:** simple preference ranking after hard eligibility filters.

**MDE destination:** user-scoped rental preferences and result ranking.

**Real-world example:**

> “Quiet, fast Wi-Fi, walkable, no steep hills.”

Those are ranking preferences. They help order valid apartments but never override budget, dates, bedrooms, ownership, or availability.

**Do not copy:** semantic matching as the only search/filter system.

---

## Task 4 · Useful references, but not Core/MVP requirements

These stay in the catalog so MDE can revisit them later without rediscovering them.

| Reference | URL | Potential future use | Phase |
|---|---|---|---|
| Mastra Company Knowledge | https://github.com/mastra-ai/template-company-knowledge | Building/broker/neighborhood knowledge with grounding | Advanced |
| Mastra Deep Search | https://github.com/mastra-ai/template-deep-search | Deep neighborhood/market research | Advanced |
| Mastra Browsing Agent | https://github.com/mastra-ai/template-browsing-agent | Governed external source verification | Advanced |
| Mastra Agent Harness | https://github.com/mastra-ai/template-agent-harness | Broker coworker/task/approval ideas | Advanced |
| Mastra Text-to-SQL | https://github.com/mastra-ai/template-text-to-sql | Broker/admin analytics reference | Advanced |
| PropertyShop | https://github.com/awallathome/property_shop | Progressive specialist property research | Advanced |
| PropGenie / real-estate-agent | https://github.com/neoxu999/real-estate-agent | Agent/tool responsibility ideas | Advanced/reference |
| AI Real Estate Assistant | https://github.com/AleksNeStu/ai-real-estate-assistant | Saved search/comparison/valuation surface ideas | Later |
| Real Estate RAG | https://github.com/jusnaini/real-estate-rag | Evaluated prose knowledge retrieval | Advanced |
| Keya | https://github.com/Archit1706/Keya-Agentic-AI-assistant-for-Real-Estate | Contextual local-place enrichment | Advanced |
| Real Estate MCP Server | https://github.com/open-estate-ai/real-estate-mcp-server | MCP concept only; implementation/license must be verified | Advanced/reference |

### Core/MVP rule

> A reference being useful does not make it an MVP dependency.

Do not add multi-agent swarms, A2A, MCP, browser agents, schedules, autonomous broker agents, observational memory, or deep-research loops to the rental MVP unless a real production blocker proves the simple architecture cannot solve the problem.

---

## Task 5 · Official framework references

### CopilotKit

- Mastra integration: https://docs.copilotkit.ai/mastra
- Shared state: https://docs.copilotkit.ai/mastra/shared-state
- Generative UI/tool rendering: https://docs.copilotkit.ai/generative-ui/tool-rendering
- HITL: https://docs.copilotkit.ai/human-in-the-loop
- Source: https://github.com/CopilotKit/CopilotKit

### Mastra

- Docs: https://mastra.ai/docs
- Agents: https://mastra.ai/docs/agents/overview
- Tools: https://mastra.ai/docs/agents/tools
- Workflows: https://mastra.ai/docs/workflows/overview
- Memory: https://mastra.ai/docs/memory/overview
- Source: https://github.com/mastra-ai/mastra

### Supabase

- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- pgvector: https://supabase.com/docs/guides/ai/vector-columns
- Postgres functions: https://supabase.com/docs/guides/database/functions

### Google Maps

- Maps JavaScript API: https://developers.google.com/maps/documentation/javascript
- Places API: https://developers.google.com/maps/documentation/places/web-service/overview
- Routes API: https://developers.google.com/maps/documentation/routes

---

## Task 6 · Before adapting any external repo

Record:

```text
Verified date:
MDE main SHA:
Reference repo:
Reference SHA/tag:
License:
MDE package versions:
Exact MDE destination:
Tests to prove adaptation:
Classification:
```

A moving `main` URL is fine for research. Any future `COPY` or direct code adaptation must pin the exact source revision and verify its license first.
