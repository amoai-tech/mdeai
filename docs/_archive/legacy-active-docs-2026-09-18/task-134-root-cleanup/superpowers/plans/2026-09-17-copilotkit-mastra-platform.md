# Task 53 · MDE-AI-PLATFORM-DOCS-001 — CopilotKit + Mastra Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add canonical CopilotKit + Mastra platform documentation, references, roadmap, navigation, and Linear ownership without changing runtime behavior.

**Architecture:** Preserve the existing Next.js → CopilotKit/AG-UI → Mastra → Supabase architecture. Documentation must start from merged MDE code, then verify upstream claims against official CopilotKit/Mastra docs and repositories before recommending a primitive, example, template, Studio capability, or custom implementation.

**Tech Stack:** Next.js 16.3.5, React 19.2.1, CopilotKit 1.55.2 using `/v2` React APIs, AG-UI, Mastra beta, PostgresStore, Supabase, Gemini, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-17-copilotkit-mastra-platform-design.md`

## Global Constraints

- Linear is execution truth; do not create a second live task queue in Markdown.
- GitHub merged `main` is code truth.
- Live Supabase is DB/auth truth.
- Keep CopilotKit packages pinned to `1.55.2` unless a dedicated upgrade task changes them.
- `src/**` uses the `@copilotkit/react-core/v2` API surface; do not reintroduce bare v1 imports.
- Keep `useHumanInTheLoop` as the production HITL standard until a compatibility spike proves an interrupt migration.
- Prefer Mastra Studio/CLI and official primitives/examples/templates before custom code.
- Do not touch the dirty local `/home/sk/mdeai` worktree; implement on an isolated branch from current `main`.

---

### Task 53.1 · MDE-AI-DOCS-FOUNDATION-001 — Canonical Platform Guide

**Files:**
- Create: `docs/03-platform/copilotkit-mastra/README.md`

**Interfaces:**
- Consumes: current `src/mastra/index.ts`, `src/app/api/copilotkit/[[...path]]/route.ts`, `src/mastra/lib/storage.ts`, current package manifest.
- Produces: canonical current-state architecture and implementation rules for later platform/domain docs.

- [ ] Document the verified runtime ownership boundaries.
- [ ] Document current agents/workflows/persistence/request-context behavior.
- [ ] Document the build-before-custom decision ladder.
- [ ] Document the production HITL decision and migration guardrail.
- [ ] Add Mermaid runtime and HITL diagrams.
- [ ] Link exact official references.

### Task 53.2 · MDE-AI-REFERENCE-001 — Official Reference Pack

**Files:**
- Create: `docs/03-platform/copilotkit-mastra/reference-pack.md`

**Interfaces:**
- Consumes: official CopilotKit/Mastra docs, GitHub examples/templates and Context7 verification.
- Produces: mandatory lookup table for implementation tasks.

- [ ] Add CopilotKit docs for Mastra, app context, frontend tools, shared state, tool rendering, HITL.
- [ ] Add CopilotKit examples: integration, canvas, PM canvas, generative UI, CRM, A2A travel, examples index.
- [ ] Add Mastra docs for agents, tools, workflows, memory, observability, evals, Studio and Postgres.
- [ ] Add official templates/skills.
- [ ] Add Studio/CLI routes and “use before custom UI” guidance.

### Task 53.3 · MDE-AI-ROADMAP-001 — Technical Roadmap

**Files:**
- Create: `docs/03-platform/copilotkit-mastra/roadmap.md`

**Interfaces:**
- Consumes: platform guide and reference pack.
- Produces: durable capability ordering; Linear owns live issue order/status.

- [ ] Define NOW: bridge stability, audit gate, HITL, Studio, persistence, shared state/tool rendering.
- [ ] Define NEXT: scorers/datasets/evals, GenUI reuse, cross-screen state, observability.
- [ ] Define LATER: interrupt compatibility spike, package upgrade, MCP/multi-agent expansion only when justified.
- [ ] Add success criteria and anti-patterns.

### Task 53.4 · MDE-AI-DOCS-NAV-001 — Canonical Navigation

**Files:**
- Modify: `docs/03-platform/README.md`
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: new platform folder.
- Produces: discoverable canonical entry points without a competing docs hierarchy.

- [ ] Add the CopilotKit + Mastra platform package to both navigation files.
- [ ] Keep `docs/README.md` as the only canonical docs router.

### Task 53.5 · MDE-AI-LINEAR-001 — Linear Ownership

**Files:**
- Linear: create one CopilotKit epic and one Mastra epic under MDE AI.
- Linear: create one canonical document under each epic.

**Interfaces:**
- Consumes: GitHub platform docs and roadmap.
- Produces: live execution ownership separated by platform while sharing the same runtime architecture.

- [ ] Create CopilotKit epic covering bridge/UI/shared state/GenUI/HITL/guardrails.
- [ ] Create Mastra epic covering agents/tools/workflows/storage/Studio/evals/observability.
- [ ] Create and link one canonical Linear document to each epic.
- [ ] Cross-link both epics because changes at the integration boundary often require coordinated verification.

### Task 53.6 · MDE-AI-VERIFY-001 — Documentation Verification

**Files:**
- Verify all files above.

- [ ] Check all repository-relative links.
- [ ] Check external official URLs are exact and current.
- [ ] Verify no active doc incorrectly says the app is bare-v1 CopilotKit.
- [ ] Verify no doc recommends browser `service_role` access.
- [ ] Verify the `useHumanInTheLoop` production decision matches current source.
- [ ] Verify the known dead `audit:copilotkit-v2` command is recorded as roadmap work, not falsely reported as passing.
- [ ] Open a focused PR from the isolated branch.
