# Jev Agent — MDE AI Tooling Reference

> **Purpose:** Tell coding agents **when Jev adds value** during MDE development, how to invoke the installed tools, and what constitutes real proof. Jev is optional; it does **not** implement code, replace tests, grant authorization, or approve a PR.

**Audience:** DeepSeek Super Agent, Claude Code, Codex, and other agents that read [AGENTS.md](AGENTS.md).
**Owner:** This file is the single reference for Jev-specific tool selection, examples, and measurement. Repository-wide requirements remain in AGENTS.md and the relevant [canonical skills](.claude/skills/INDEX.md).

## The 20-second decision

| Need | Start with | Add Jev only when… | Actual proof |
| --- | --- | --- | --- |
| Find a known symbol or call site | `rg`, current Graphify index | Quicksilver: file/function names are unknown or the semantic search space is large | Read shortlisted source and trace the call |
| Pick between two feasible implementations | Code/types + existing `efficient` / `ponytail` skill | `jev_decide` or `jev_compare`: trade-offs remain genuinely ambiguous | Working prototype + tests |
| Organize many tickets, errors, or component gaps | Deterministic inventory or exact filters | `jev_classify` / `jev_rerank`: ambiguous categories or relevance | Inspect representative assignments |
| Evaluate AI language and recommendations | Grounded fixtures + exact factual checks | `jev_noul`, `jev_verify`, or Jev Evals: subjective quality matters | Fixture assertions + human-visible result |
| Find weak tests / maintainability risks | Vitest, Playwright, CI | Supercov: focused diff, branches, assertions | Reproduced failing or passing test |
| Inspect a web journey | Playwright or trusted Chrome DevTools | Jev Browser: exploratory browsing only | Deterministic DOM, network, and DB assertions |
| Decide whether to report Done | CI, real UI/API/DB proof, task-verifier | `jev_gate`: optional evidence challenge | Exact-head checks, review and approval |

**Default:** If an exact grep or a deterministic assertion resolves the question, **skip Jev**. Never perform multiple Jev judgments merely to confirm the same result.

## Availability and configuration

The following are **reported installed on the owner's Ubuntu/DeepSeek machine**, not guaranteed in CI or every agent runtime. Detect availability; do not assume global installation. Never expose `TYPESAFE_API_KEY`, `JEV_API_KEY`, private source payloads, authenticated screenshots, or secret-bearing logs.

| Installed capability | Entry point | When to use | Avoid |
| --- | --- | --- | --- |
| Jev MCP (12 tools) | Connected `jev` MCP server | Bounded classification, ranking, verification and choices | Giving it authority to merge or execute side effects |
| Jev Browser | `jev_browser` / `jev_navigate` | Read-only exploratory navigation | Replacing Playwright E2E evidence |
| Quicksilver | `qs.mjs` CLI / `quicksilver` skill | Semantic shortlist across many unfamiliar files | Known file names; repetitive broad scans |
| Supercov 4.27.0 (pilot) | `supercov` CLI / `supercov` skill | Diff quality/security; coverage and assertion gaps | Whole-repo gap scoring with a focused test run |
| Jev Gate | `jev-gate` skill / `jev_gate` MCP | Challenge completion claims against raw proof | Treating confidence as CI approval |
| Jev Evals | Locally modified `~/tools/jev-evals` | Rubric evaluation for Concierge response quality | Factual ID, pricing, RLS or database checks |
| Other Jev skills | `jev`, `jev-triage`, `jev-documents`, `jev-eval`, `jev-act` | Relevant procedural guidance | Loading all skills for every task |

**Machine-specific paths** are examples only; never bake `/home/sk` or `~/.nvm` into app code/CI. `jev-evals` direct TypeSafe support was tested in a *local modified clone*, not claimed as upstream package behavior. Reverify its availability before use. Jev Belay is a Claude Stop hook, not a DeepSeek gate; no additional DSH Jev plugins are required.

### MCP tool selector (12 available through the reported `jev` server)

| Tool | Best application | MDE example |
| --- | --- | --- |
| `jev_find` | Identify relevant candidates | Find likely source files from descriptions |
| `jev_rerank` | Reorder a small ambiguous shortlist | Rank card-to-Details handoff files |
| `jev_classify` | Label many ambiguous entries | Group CI failures or unknown component gaps |
| `jev_decide` | Choose among bounded alternatives | Reuse native viewing modal versus a new form path |
| `jev_noul` | Score propositions against supplied evidence | Is an AI summary making an unsupported availability claim? |
| `jev_verify` | Compare one claim against source excerpts | Does a summary match the actual supplied event data? |
| `jev_gate` | Evaluate completion evidence | Challenge “8/8 cards passed” against raw test output |
| `jev_review` | Advisory diff-quality feedback | Review a minimal A2UI state change |
| `jev_audit` | Structured multi-claim audit | Check a task's acceptance evidence |
| `jev_extract` | Extract structured facts | Pull explicit criteria from task text |
| `jev_compare` | Compare candidate approaches | Official EntityCard vs MDE RentalCard parity |
| `jev_screen` | Evaluate screenshot descriptions or supported visual inputs | Identify questionable mobile layout (not visual QA proof) |

**Tool invocation:** Use the schemas advertised by the **currently connected MCP tools**. Do not copy pseudo-call signatures from old notes as if they were verified API contracts. If a tool is absent, use ordinary source inspection and tests.

## Agent skills — choose only the relevant one

| Skill | Trigger | Real-world example |
| --- | --- | --- |
| `quicksilver` | Large unfamiliar code surface | Find how a Mastra tool result becomes an A2UI card |
| `supercov` | Changed-code risk or suspect assertions | Find uncovered viewing retry branches |
| `jev-gate` | Significant Done/PR claim | Compare actual eight-case log with the claim |
| `jev` | Need MCP request design guidance | Structure a bounded ranking question |
| `jev-triage` | Many ambiguous findings | Group 30 test failures by probable root cause |
| `jev-documents` | Claim-to-source matching | Map Linear criteria to real code/test references |
| `jev-eval` | Rubric-based subjective judgments | Rate explanations of grounded recommendations |
| `jev-act` | Restricted next-action choice | Choose from a small validated list; never grant browser permissions |

**Skill ownership:** Repository skills `.claude/skills/<name>/SKILL.md` remain authoritative for implementations, testing, Supabase, CopilotKit and lifecycle. Locally installed Jev skills are optional and not necessarily present in this repository or CI; do not create duplicate copies solely for documentation.

## Safe commands and examples

```bash
# First: exact low-cost search
rg -n 'render_ui|data-listing-id|detailsId|openVenueDetail' src/components src/mastra

# Optional semantic search (only if grep is inconclusive)
# Run according to the installed Quicksilver skill's current syntax.
qs filter "Does this file render an A2UI card from a tool result?" src/components/copilot src/mastra

# After implementing a focused diff; check base and command availability.
supercov quality patch --base origin/main
supercov security patch

# Investigate assertion strength before optional API spending:
supercov runs latest assertions assess --dry-run
```

For all commands: check help/installed version, scope to relevant files, and do not run live write operations merely to obtain a quality score.

## Real development scenarios

### SAN-1653 — Generated card opens the correct listing

1. **Reuse the already completed Quicksilver discovery:** 385 files scanned → 43 shortlisted in 4.6 seconds, $0.0309, four key files identified. Do **not** pay for the same search again.
2. Inspect `src/components/copilot/a2ui/mde-ui-catalog.tsx`, `src/components/copilot/search-tool-result-cards.tsx`, `src/mastra/lib/recommendation-surface-bridge.ts`, `src/mastra/lib/rental-recommendations-ui.ts` plus the existing native Details owner.
3. Reuse the existing catalog/bridge; never add a second search engine, renderer, modal, or route.
4. **Playwright** tests eight required Rental/Event source-row → newly generated `render_ui` card → native Details ID cases. Test first/second/named/invalid/stale, replay, and 390px according to the live Linear acceptance criteria.
5. Actual source ID must equal rendered card ID and open native Details ID. Screenshots or Jev confidence **alone** do not prove this; capture DOM attributes and assertions.
6. Optional Jev Gate challenges the **raw** case log and exact diff. Evidence from an existing native grid card does not count as proof of a newly generated A2UI card.

### SAN-1668 — Full pinned Standard Catalog

1. Compare the actual installed CopilotKit Standard Catalog export against MDE's one `mde/discovery@1` registry. Verify the advertised 69 count against installed types and runtime.
2. Mechanically classify present/missing/partial names first; `jev_classify` only for *ambiguous* component integration requirements.
3. Reuse SDK inheritance and MDE custom `RentalCard`/`EventCard`; preserve named Surface allowlists and real action boundaries.
4. Test malformed props, URLs/media, unavailable optional integrations, chat-wide exposure and 390px. **Catalog availability is not 69 working MDE workflows.**
5. Supercov on the catalog diff; ordinary tests prove actual schemas and renders.

### SAN-1658 — Editable viewing form

1. Inspect the existing Schedule Viewing modal, trusted listing lookup, date/time parser and atomic submission.
2. If reuse options remain genuinely tied, ask `jev_decide` to compare *existing modal handoff* with alternatives. State priorities: smallest change, latest user edit wins, no duplicate booking path.
3. Implement the official Form/field handoff in the existing catalog with pinned types. Confirm latest edited `@path` value is available; do **not** assume the Form's submit event contains all field values.
4. Form Continue prefills **native review only**. No lead/showing exists before native confirmation. Test Medellín-local 15-minute choices, stale IDs, edit precedence.
5. Playwright + Supabase readback proves **one** atomic lead/showing after confirmation, correct broker access, and retry without duplicates. Supercov can point out missing retry assertions.

### SAN-1659 — Host Analytics insights

1. Reuse the HostOps provider/agent and existing deterministic KPI loader.
2. Generate a named Surface with host-authorized sales rows only; never hallucinate revenue or cross-tenant data.
3. Verify numeric equality and RLS with deterministic checks. Use Jev Evals **only** for the explanation's faithfulness, not totals.
4. Validate 1440/768/390 rendering, fallback/clear, thread isolation, and existing host chat.

### SAN-1669 — Official Select / EntityCard feasibility

Use `jev_compare` (advisory) to evaluate the pinned official component against the already-working custom control; include writable values, draft ownership, Apply behavior, map/Details actions, maintainable lines of code and mobile parity. Decide **adopt** only after an actual SDK prototype and Playwright proof. Retaining the existing UI is a successful evidence-based result.

## What Jev does NOT prove

- A model score cannot establish the correct listing ID, availability, price, tenant authorization, payment, or database persistence.
- An agent-generated screenshot description is not DOM/DB evidence.
- Estimated “tokens not read” cannot establish actual DeepSeek or Claude token savings.
- A Jev Gate PASS cannot replace exact-head CI, human review, `task-verifier`, or authorization.
- Jev Browser cannot replace repeatable authenticated Playwright journeys.
- No Jev skill or score may introduce Phase A business approval, rental eligibility, publication or ownership gates. Keep security/RLS/auth/idempotency.

## Measured pilots — do not extrapolate to all tasks

| Pilot | Observed | Important limitation |
| --- | --- | --- |
| SAN-1653 Quicksilver | 385 files → 43 matches → four priority files; 4.6s; $0.0309 | ~537k “tokens not read” is an **estimate**, not metered DeepSeek savings |
| Quicksilver earlier large scan | 1,501 files → 66 candidates; 15.7s; ~$0.0986 | No verified matched `rg`-vs-Jev end-to-end timing comparison |
| Supercov scoped module | Quality 7.1/10 across four `src/lib/leads` files, $0.0004, 627 ms | Heuristic quality rating, not functional correctness |
| Supercov viewing tests | 62/63 in instrumented run | One source-reading test failed under coverage; re-run after fixing portability |
| Jev Evals direct TypeSafe pilot | 3 deliberately failing cases evaluated; 52 tests passed, 1 skipped in local modified clone | Deliberately bad samples, not confirmed live MDE regressions |

**Measurement for subsequent tasks:** Record actual model/provider tokens, Jev cost, elapsed code discovery time, meaningful defects found, rework and completed acceptance tests. Compare similar tasks without Jev before claiming speed/accuracy improvements.

## Privacy, cost and fallback

1. Before sending evidence externally, minimize to sanitized excerpts; remove secrets, cookies, bearer tokens, email/phone/address of customers, private attachments and service-role output.
2. Prefer deterministic, local tests for IDs, numeric totals, authorization, retries and DB state.
3. Cap ambiguous judgments to a small candidate list; avoid recursive Jev tool chains, redundant reranking and broad quality scans.
4. If `qs`, `supercov` or any MCP tool is unavailable, continue with `rg`, existing code review, Vitest, Playwright and repo CI. No tool-installation prerequisite to feature development.
5. Do not automatically add vendor APIs, gate PRs on Jev scores, or copy local `~/.claude/skills` into the repository.

## Reference URLs

- [Jev MCP — tools](https://github.com/jkudish/jev-mcp)
- [Jev Browser](https://github.com/jkudish/jev-browser)
- [Quicksilver](https://github.com/UditAkhourii/quicksilver)
- [Supercov](https://github.com/supercorp-ai/supercov)
- [Jev skills](https://github.com/wuyoscar/jev-skill)
- [Jev Evals](https://github.com/NicolasMontone/jev-evals)
- [CopilotKit Standard Catalog](https://docs.copilotkit.ai/generative-ui/components/standard-catalog)
- [CopilotKit State and Actions](https://docs.copilotkit.ai/generative-ui/components/state-and-actions)
- [CopilotKit Surfaces](https://docs.copilotkit.ai/generative-ui/components/surfaces)
- [MDE interactive foundation Linear epic](https://linear.app/amo100/issue/SAN-1657/epic-mde-ai-copilotkit-interactive-foundation)

**Maintenance:** Re-check GitHub URLs, pinned SDK APIs, installed tool names and benchmarks when they materially change. Keep current task statuses in Linear, not in this reference.
