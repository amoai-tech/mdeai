---
title: mdeai Skills Index — graded vs PRD v6.0
date: 2026-06-08
plan: ./prd.md (CopilotKit 1.55.2 + Mastra + Next.js 16 @ mdeapp root)
progress: ../progress/may30.md
task_router: todo.md § Skill + MCP gate
audit: ../plan/audit/01-plan-audit.md
enforce: .cursor/rules/mdeai-task-skill-mcp-gate.mdc
legend:
  green: "🟢 85–100 — Phase 1 essential or daily driver"
  yellow: "🟡 50–84 — keep on disk; load when topic appears"
  red: "🔴 0–49 — do not load for new plan (archive / symlink-remove / defer)"
---

# Skills index — PRD v6.0 alignment

## Current architecture (2026-09-20)

| Rule | Detail |
|------|--------|
| **Canonical source** | `.claude/skills/` — real skill content lives here |
| **Per-task routing** | [`todo.md`](./todo.md) § **Skill + MCP gate** — mandatory before Done |
| **Enforcement** | [`.cursor/rules/mdeai-task-skill-mcp-gate.mdc`](../.cursor/rules/mdeai-task-skill-mcp-gate.mdc) |
| **Load cap** | **≤5 skills** per task — pick one row below or todo matrix row |
| **MDE stack** | Next.js 16 + React 19 + CopilotKit **1.55.2 using `/v2` React API entrypoints** + Mastra + Supabase + Gemini + Google Maps |
| **Routing rule** | Use the canonical owner directly; `.agents/skills` is compatibility-only |
| **100% before Done** | Skills read + MCP called + `task-verifier` Evidence Score ≥ **90** (P0) |

### Canonical skill layout (2026-09-20)

**Canonical owner folders use their exact `.claude/skills/` names.** Primary runtime/domain owners are `copilotkit`, `mastra`, `supabase`, `gemini`, `maps`, `stripe`, `nextjs`, `cloudinary`, `events`, and `real-estate`; task/ops owners include `tasks`, `testing`, `code-review`, `task-verifier`, `mde-vercel`, and `mde-worktree-pr-flow`. See Section A for the complete current inventory.

`mde-real-estate` remains present as an explicit protected legacy exception in this cleanup; `real-estate` is still the canonical owner.

**Compatibility layout:**

| Path | Rule |
|------|------|
| `.claude/skills/<name>/` | Canonical editable skill content |
| `.agents/skills/<name>/SKILL.md` | Compatibility symlink → `../../../.claude/skills/<name>/SKILL.md` |
| Direction | `.agents` → `.claude` only; never `.claude` → `.agents` |

### Load by work type (authoritative routing)

| Work type | Canonical owner | Supporting skill when needed |
|-----------|-----------------|------------------------------|
| Substantial Linear task | `tasks` | `testing`, `task-verifier` |
| CopilotKit / AG-UI | `copilotkit` | `mastra` |
| Mastra agents/tools/workflows | `mastra` | `copilotkit`, `supabase` |
| Supabase / RLS / SQL / Edge Functions | `supabase` | `task-verifier` for S4 |
| Google Maps / Places | `maps` | `testing` |
| Gemini models/provider | `gemini` | owning domain skill |
| Stripe/payments | `stripe` | `task-verifier` for S4 |
| Next.js runtime/framework | `nextjs` | `testing` |
| Cloudinary/media | `cloudinary` | owning domain skill |
| Events | `events` | relevant stack skill |
| Real estate | `real-estate` | relevant stack skill |
| Existing diff / PR review | `code-review` | specialist review skill |
| Unknown root cause | `systematic-debugging` | owning domain after diagnosis |
| UI state / interaction design | `wireframe` | `nextjs` |
| Architecture/dependency diagram | `mermaid-diagrams` | owning domain skill |

**Canonical path:** `.claude/skills/<name>/`.
**Compatibility path:** `.agents/skills/<name>/SKILL.md` → canonical `SKILL.md`.

## Historical audit snapshot (2026-06-08)

> Historical record only. Do not use this section for current skill routing, ownership, package API selection, or symlink direction; use the current architecture above.

**North star:** App at `/home/sk/mdeai/mdeapp/` from `CopilotKit/examples/integrations/mastra/`. **7 Mastra agents**, 3 workflows, Supabase, Stripe, Maps. CopilotKit **1.55.2** (not v2).

**Layout:** `.claude/skills/` is the canonical skill library. `.agents/skills/` contains compatibility symlinks only.

**Counts (active, non-`_archive`):**

| Bucket | Count | Action |
|--------|------:|--------|
| 🟢 Phase 1 pack | **22** | Enable in Cursor / Claude project skills |
| 🟡 ADK / agents-cli dev pack | **7** | Load when scaffolding `services/adk-grounding/` — see [../plan/ADK/notes.md](../plan/ADK/notes.md) |
| 🟡 Adjacent / Phase 2+ | **28** | Keep; do not auto-load in every session |
| 🔴 Drop from default load | **43+** | Archive, unlink symlink, or `disable-model-invocation` |
| `_archive/` | 18 | Already retired — ignore |

**PRD Part 0 matrix** ([../plan/prd/00-skills-reference.md](../plan/prd/00-skills-reference.md)) — all map to 🟢 below.

---

## Phase 1 recommended pack (load these)

| Skill | Score | Path |
|-------|------:|------|
| copilotkitV1 | 97 | symlink — **v1 hooks for mdeapp** (1.55.2) |
| copilotkit | 98 | `.agents` → symlink `.claude` |
| copilotkit-setup | 96 | symlink |
| copilotkit-integrations | 98 | symlink — **Mastra wiring** |
| copilotkit-develop | 88 | symlink — **v2 docs**; mdeapp uses `copilotkitV1` + integrations |
| copilotkit-agui | 92 | symlink — HITL + shared state |
| copilotkit-debug | 94 | symlink — incident response |
| mastra | 98 | `.claude/skills/mastra` native |
| supabase | 96 | native |
| supabase-edge-functions | 82 | symlink — edge fn port W4–W9 |
| gemini | 90 | native — **`gemini-3.5-flash`** in mdeapp per CLAUDE.md |
| task-verifier | 88 | native — **CTI/OCL Done gates**; load before flipping tasks |
| maps | 94 | native — W5–W6 rentals/chat |
| tasks | 95 | native — plan→ship |
| mermaid-diagrams | 88 | native — PRD/task diagrams |
| testing | 92 | native — Vitest + Playwright |
| mde-vercel | 90 | native — deploy + Next perf |
| mde-stripe | 86 | native — W9 tickets |
| mde-worktree-pr-flow | 88 | native — PR discipline |
| mde-real-estate | 80 | native — Camila / rentals vertical |
| code-review | 82 | symlink |
| autofix | 78 | symlink |
| plan-analysis | 76 | symlink — critique plans before tasks |
| mastra-smoke-test | 74 | symlink — after agent port |

**MCPs (not skills):** `copilotkit-docs`, `mastra-docs`, `gemini-api-docs-mcp`, `google-maps-code-assist`, `user-supabase` — use per verification cadence in Part 0.

### Coffee Tour Intelligence (CTI) — load pack

| When | Skills | MCP |
|------|--------|-----|
| Schema / seed | supabase, task-verifier | user-supabase |
| Tools / rank | mastra, copilotkit-integrations, gemini, testing | user-mastra, gemini-api-docs-mcp |
| Maps / place_id | maps | google-maps-code-assist |
| UI / smoke | copilotkitV1, shadcn, webapp-testing | copilotkit |
| Embeddings (Phase B) | pgvector, gemini | user-supabase |
| OpenClaw crawl | open-claw, mde-hostinger | **OCL-013-mvp** — not CTI-019 |

**Audit:** [`docs/tasks/audit/31-agent-tasks.md`](docs/tasks/audit/31-agent-tasks.md) · **Tasks:** [`docs/tasks/agent/tasks/INDEX.md`](docs/tasks/agent/tasks/INDEX.md)

**ADK planning (not skills):** [../plan/ADK/prd-adk.md](../plan/ADK/prd-adk.md), [../plan/openclaw/01-openclaw-adk.md](../plan/openclaw/01-openclaw-adk.md).

---

## ADK / agents-cli dev pack (load for Phase 2 sidecar only)

**Dev assist only** per [ADK — Coding with AI](https://adk.dev/tutorials/coding-with-ai/): `agents-cli` + `google-agents-cli-*` skills (+ optional **adk-docs-mcp** on `adk.dev/llms.txt`). Installed via `uvx google-agents-cli setup` / `npx skills add google/agents-cli`. Paths: `.agents/skills/google-agents-cli-*` (and `.claude/skills/` symlinks). **Not** Camila’s runtime — Cursor uses these while building `services/adk-grounding/`. CLI: `~/.local/bin/agents-cli` (v0.2.0).

| Skill | Score | | Phase? | Notes |
|-------|------:|:---:|--------|-------|
| google-agents-cli-workflow | 92 | 🟡 | P2 dev | Scaffold-first lifecycle; entry for any ADK work |
| google-agents-cli-adk-code | 90 | 🟡 | P2 dev | `agent.py`, tools, `SkillToolset`, Maps/Search tools |
| google-agents-cli-scaffold | 88 | 🟡 | P2 dev | `agents-cli scaffold create` / `enhance` |
| google-agents-cli-eval | 86 | 🟡 | P2 dev | Golden queries — no hallucinated `place_id` |
| google-agents-cli-deploy | 84 | 🟡 | P2 dev | Cloud Run / Agent Runtime — after MAP MVP |
| google-agents-cli-observability | 78 | 🟡 | P2+ | Trace / BigQuery — Patricia ops |
| google-agents-cli-publish | 72 | 🟡 | P2+ | Gemini Enterprise registration |

**Runtime ADK skills (different):** file-based `SKILL.md` under `services/adk-grounding/skills/` loaded by ADK `SkillToolset` at request time — see [Google ADK Skills blog](https://developers.googleblog.com/developers-guide-to-building-adk-agents-with-skills/) and [../plan/ADK/prd-adk.md](../plan/ADK/prd-adk.md) §12. Optional coding pack: `npx skills add google/adk-docs -y`.

**mdeai rule:** Mastra stays orchestrator in this repo (`mdeapp`); do not replace `/api/copilotkit` with ADK `HttpAgent` for production concierge.

---

## Grading rubric (vs new plan)

| Score | Dot | Need for PRD v6.0 |
|------:|:---:|-------------------|
| 85–100 | 🟢 | Explicit in PRD, W1–W10 delivery, or blocking ops (deploy/test/review) |
| 50–84 | 🟡 | Real value but Phase 2+, ops-only, meta/tooling, or duplicate of a greener skill |
| 0–49 | 🔴 | Wrong stack (Vite chat, v2-only, vendor SaaS), superseded, deferred feature, or duplicate |

---

## A — Canonical `.claude/skills` inventory

`.claude/skills/` is the editable source of truth. Current real skill directories with `SKILL.md`: **34 total** — **33 active/protected skills plus `_template`**. `archive/` is a container, not an active skill.

| Group | Exact folders |
|-------|---------------|
| Runtime / domain owners | `cloudinary`, `copilotkit`, `events`, `gemini`, `maps`, `mastra`, `nextjs`, `real-estate`, `stripe`, `supabase` |
| Task / engineering workflow | `code-review`, `lean-dev-flow`, `mde-vercel`, `mde-worktree-pr-flow`, `mermaid-diagrams`, `playwright-cli`, `research`, `systematic-debugging`, `task-verifier`, `tasks`, `tdd`, `testing`, `using-mde-skills`, `wireframe`, `writing-skills` |
| Specialist review | `ci-review`, `copilotkit-review`, `maps-review`, `mastra-review`, `nextjs-review`, `stripe-review`, `supabase-review` |
| Protected legacy exception | `mde-real-estate` — retained by explicit cleanup constraint; do not treat it as the canonical real-estate owner |
| Template | `_template` |

---

## B — `.agents/skills` compatibility links (27)

`.agents/skills/` contains compatibility symlinks only. Every link must resolve to the matching canonical `.claude/skills/<name>/SKILL.md`; never put editable skill content in `.agents/skills/`.

Current compatibility names: `_template`, `cloudinary`, `code-review`, `copilotkit`, `events`, `gemini`, `lean-dev-flow`, `maps`, `mastra`, `mde-real-estate`, `mde-vercel`, `mde-worktree-pr-flow`, `mermaid-diagrams`, `nextjs`, `playwright-cli`, `real-estate`, `research`, `stripe`, `supabase`, `systematic-debugging`, `task-verifier`, `tasks`, `tdd`, `testing`, `using-mde-skills`, `wireframe`, `writing-skills`.

---

## C — `.agents/skills` only

**None.** This bucket is intentionally empty after canonicalization. A regular file, standalone skill, broken link, or link outside `.claude/skills/` under `.agents/skills/` is an integrity failure.

---

## D — `_archive/` (already retired)

| Path | Score | | Action |
|------|------:|:---:|--------|
| `_archive/2026-05-14/*` | 10 | 🔴 | Keep archived |
| `_archive/2026-05-07/*` | 10 | 🔴 | Keep archived |

Includes: `ai-building-chatbots-vendor`, `better-chatbot-vendor`, `google-maps-stub`, old `roadmap`, `hostinger-vps`, real-estate one-offs, vitest/preview splits.

---

## E — Plan vs skills gap analysis

| PRD requirement | Skill status | Gap |
|-----------------|-------------|-----|
| CopilotKit 1.55.2 + Mastra | 🟢 `copilotkit` + `mastra` | Current app code uses `@copilotkit/react-core/v2` entrypoints; verify the exact installed API surface before changing provider/hooks |
| Supabase reuse | 🟢 supabase | Edge fn forensic W5 — use symlink + MCP |
| Gemini **`3.5-flash`** | 🟢 gemini + MCP | CLAUDE.md registry; CTI-004/011 use `@ai-sdk/google` |
| Maps W5–W6 | 🟢 maps | Remove `google-maps-api` / `react-google-maps` from default load |
| ADK grounding service (Phase 2) | 🟡 google-agents-cli-* | Phase 1 = Mastra + Grounding Lite MCP ([MAP-002](docs/tasks/maps/MAP-002-grounding-attribution.md)); ADK HTTP sidecar after pins ship |
| Stripe W9 | 🟢 `stripe` | Use the canonical `stripe` owner; keep payment changes behind S4 verification |
| WhatsApp | 🔴 mde-whatsapp | Correctly deferred Phase 2 |
| OpenClaw (OCL-013) | 🟡 open-claw | VPS crawl **after** CTI-001A–010; not chat runtime |
| Custom ai-router | 🔴 mastra-routing | Replaced by CopilotKit agent selection |
| 20–50 enabled skills (PDF BP1) | 🔴 **~74 enabled** | **Load Phase 1 pack only (~22)** |

---

## F — Current maintenance rules

1. Edit skill content only under `.claude/skills/<name>/`.
2. Keep `.agents/skills/` compatibility-only: symlinks must point to matching `.claude/skills/<name>/SKILL.md`.
3. Route work through the canonical owner names in the current architecture table; do not resurrect retired aliases such as `mde-maps`, `mde-supabase`, or `mde-task-lifecycle`.
4. Treat `mde-real-estate` as the explicit protected legacy exception; `real-estate` remains the canonical owner.
5. Verify skill changes with symlink integrity, routing-contract tests, session-start tests, and `git diff --check`.
6. For CopilotKit, inspect the installed package and imports before changing APIs; this repo currently uses `@copilotkit/react-core/v2` entrypoints on package `1.55.2`.

---

## G — Current integrity snapshot (2026-09-20)

| Check | Expected state |
|-------|----------------|
| Canonical skill files | `.claude/skills/` only |
| `.agents/skills` regular files | `0` |
| `.agents/skills` compatibility symlinks | `27` |
| Broken `.agents/skills` links | `0` |
| Noncanonical `.agents` targets | `0` |
| `.agents-only` skills | `0` |
| Protected real-estate paths | unchanged by this cleanup |

---

## Quick reference — dot legend

- 🟢 **Keep & load** for mdeapp Phase 1  
- 🟡 **Keep on disk** — load on topic  
- 🔴 **Do not load** for new plan (archive / unlink / defer)

*Current architecture verified 2026-09-20. The 2026-06-08 inventory above is retained only as historical context.*
