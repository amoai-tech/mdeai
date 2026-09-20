# MDE Rentals Domain Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the canonical MDE Real Estate / Rentals documentation package with clear current-state truth, a simple Core/MVP architecture, an indexed repository/template catalog, and an explicit reuse matrix that says exactly what MDE adapts from each reference.

**Architecture:** Keep the existing MDE documentation taxonomy. `REFERENCES.md` catalogs sources, `REUSE-MATRIX.md` decides what to KEEP/ADAPT/MODEL/SKIP, `RENTALS.md` explains the real MDE product and journeys, and `README.md` routes readers to the canonical files. Core/MVP stays lean; advanced agent infrastructure is documented as deferred, not required.

**Tech Stack:** Markdown, MDE docs checker, GitHub, Linear, Next.js/CopilotKit/Mastra/Supabase concepts only as documentation inputs.

**Spec:** `docs/superpowers/specs/2026-09-20-rentals-domain-docs-design.md`

## Global Constraints

- Current MDE merged `main` is implementation truth.
- Supabase schema/RLS/functions and live read-only evidence are database truth.
- Linear owns live status, priority, ownership, and sequencing.
- Repository docs own durable product/architecture truth.
- Core/MVP must not require multi-agent swarms, A2A, MCP, browser agents, schedules, observational memory, deep research loops, or autonomous broker agents.
- SQL decides what is eligible; AI decides what is relevant among eligible candidates.
- Every external reference must state: repo → what we adapt → MDE destination → real-world example → what we do not copy.
- Unknown or incompatible license cannot be `COPY` or `ADAPT`.
- No production code or database changes in this plan.

## Review Focus

1. Vague reference language — every external repo must explain the exact MDE adaptation.
2. Core/MVP scope creep — advanced capabilities must stay explicitly deferred.
3. Current vs planned confusion — every section must distinguish shipped/current from target/reference behavior.
4. Hard-filter correctness — price, dates, bedrooms, ownership, authorization, counts, and aggregates must remain deterministic.
5. Stale or broken links — all local links and external reference URLs must resolve or be clearly marked unverified.

---

### Task 1: Build the reference index

**Files:**
- Create: `docs/04-domains/rentals/REFERENCES.md`

**Interfaces:**
- Consumes: approved rentals documentation spec.
- Produces: one indexed catalog used by `REUSE-MATRIX.md` and `RENTALS.md`.

- [ ] **Step 1: Create the reference categories**

Create sections for current MDE, official CopilotKit, official Mastra, and real-estate OSS references.

- [ ] **Step 2: Add the Core/MVP shortlist**

Prioritize only references that directly improve the MVP journey:

```text
CopilotKit Mastra Canvas → shared cards/map/filter state
CopilotKit Generative UI → typed rental cards/comparison/approval
Dubai Real Estate → SQL-first hard filtering
HomeRecoEngine → structured + geo + vector ranking
Real Estate AI Chatbot → lead qualification + broker handoff
HomeMatch → lifestyle preference ranking
```

- [ ] **Step 3: Mark advanced references as deferred**

Mark deep search, browser agents, agent harness, MCP, A2A, autonomous multi-agent patterns, and complex RAG as `ADVANCED / DEFERRED` unless a proven MVP blocker requires them.

- [ ] **Step 4: Include exact adaptation explanations**

Each reference entry must include:

```text
What it demonstrates
What MDE adapts
MDE destination
Real-world MDE example
What MDE does not copy
Action classification
Verification status
```

- [ ] **Step 5: Commit**

```bash
git add docs/04-domains/rentals/REFERENCES.md
git commit -m "docs: add rental reference index"
```

### Task 2: Build the reuse matrix

**Files:**
- Create: `docs/04-domains/rentals/REUSE-MATRIX.md`

**Interfaces:**
- Consumes: `REFERENCES.md`.
- Produces: formal reuse decisions used by `RENTALS.md`.

- [ ] **Step 1: Create the matrix columns**

Use:

```text
Capability
Current MDE
Reference
Full URL
Version/commit
License
What the repo demonstrates
Exact pattern to adapt
Exact MDE destination
Real-world MDE example
Do not copy
Action
Verification
Journey
Phase
```

- [ ] **Step 2: Add Core decisions first**

Document current MDE/Supabase/RLS/atomic-write capabilities as `KEEP` where already stronger.

- [ ] **Step 3: Add MVP adaptation decisions**

Use `ADAPT` or `MODEL` only for patterns that directly support discovery, ranking, cards/map state, viewing requests, and broker handoff.

- [ ] **Step 4: Add advanced/deferred rows**

Explicitly classify advanced references as `MODEL / DEFERRED` or `REFERENCE / DEFERRED`.

- [ ] **Step 5: Commit**

```bash
git add docs/04-domains/rentals/REUSE-MATRIX.md
git commit -m "docs: add rental reuse matrix"
```

### Task 3: Build the canonical Rentals domain document

**Files:**
- Create: `docs/04-domains/rentals/RENTALS.md`

**Interfaces:**
- Consumes: `REFERENCES.md`, `REUSE-MATRIX.md`, current MDE rental architecture, current Supabase evidence, current Linear planning docs.
- Produces: durable Real Estate product/domain truth.

- [ ] **Step 1: Write the current-state section**

State only verified current behavior. Separate `CURRENT`, `MVP TARGET`, and `ADVANCED / DEFERRED`.

- [ ] **Step 2: Document the core journeys**

Cover:

```text
J-RE-01 Rental discovery
J-RE-02 Listing detail
J-RE-03 Viewing request
J-RE-04 Broker follow-up
J-RE-05 Save/resume
J-RE-06 Failure/recovery
```

- [ ] **Step 3: Explain the Core architecture simply**

Use this invariant and flow:

```text
User request
→ hard filters in Supabase SQL
→ PostGIS location filtering/ranking
→ pgvector/rental-signals relevance
→ cards + map
→ listing
→ viewing approval
→ atomic RPC
→ broker lead/showing
```

- [ ] **Step 4: Explain references with real MDE examples**

For every major adaptation, include a user example such as:

```text
"I need a furnished 2-bedroom apartment under COP 5M in Laureles."
```

Explain which constraints SQL enforces and what AI is allowed to rank/explain.

- [ ] **Step 5: Keep MVP lean**

Add an explicit `Not required for Core/MVP` section listing multi-agent swarms, A2A, MCP, browser agents, deep research, observational memory, schedules/background agents, and autonomous broker operations.

- [ ] **Step 6: Add production proof**

Document the exact proof categories: unit/integration tests, RLS A/B, atomic-write concurrency/idempotency, Playwright renter journey, broker visibility, and production smoke.

- [ ] **Step 7: Commit**

```bash
git add docs/04-domains/rentals/RENTALS.md
git commit -m "docs: add canonical rentals domain plan"
```

### Task 4: Turn README into the rentals router

**Files:**
- Modify: `docs/04-domains/rentals/README.md`

**Interfaces:**
- Consumes: the three new canonical documents.
- Produces: clear entry point for Real Estate docs.

- [ ] **Step 1: Replace the placeholder README**

Route readers to:

```text
RENTALS.md → product/domain truth
REUSE-MATRIX.md → reuse decisions
REFERENCES.md → repo/template/example catalog
```

- [ ] **Step 2: State source-of-truth boundaries**

Keep Linear for live status and merged `main`/Supabase for implementation/data truth.

- [ ] **Step 3: Commit**

```bash
git add docs/04-domains/rentals/README.md
git commit -m "docs: route rental documentation"
```

### Task 5: Validate the documentation package

**Files:**
- Verify: all four rental docs.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: reviewable docs package with no broken local links or obvious formatting failures.

- [ ] **Step 1: Run documentation validation**

```bash
npm run docs:check
```

Expected: documentation check passes with zero broken local links.

- [ ] **Step 2: Run whitespace validation**

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 3: Manually verify scope rules**

Confirm:

```text
no advanced capability is required for Core/MVP
no vague "adapt this repo" wording remains
no unknown-license repo is classified COPY/ADAPT
no live Linear status table is duplicated
current/planned/reference behavior is explicit
```

- [ ] **Step 4: Final commit if validation fixes were needed**

```bash
git add docs/04-domains/rentals
git commit -m "docs: validate rental planning package"
```
