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

**External-data boundary:** Quicksilver can transmit the content of matching source files to an external TypeSafe-backed service; Supercov patch analysis can transmit changed-code/diff content. Jev MCP and Jev Evals transmit the `state`/evidence supplied to them. Before calling any of these, inspect the **actual input**, confirm that external disclosure is permitted, and remove secrets, customer data, proprietary material not approved for disclosure, and authenticated artifacts. Never assume a path is safe merely because it is under `src/`. For confidential code, use local `rg`, tests and review instead. A tool's reported token savings or low cost is not authorization to upload source.

```bash
# First: exact low-cost search
rg -n 'render_ui|data-listing-id|detailsId|openVenueDetail' src/components src/mastra

# Optional semantic search: ONLY on explicitly reviewed, approved,
# non-sensitive candidate files; read the installed skill's CLI syntax.
# Do not feed whole src trees, unreviewed files, or customer data.
qs filter "Does this file render an A2UI card from a tool result?" \
  src/components/copilot/search-tool-result-cards.tsx \
  src/mastra/lib/recommendation-surface-bridge.ts

# Optional external diff analysis: inspect the exact base diff first.
# Run only when EVERY changed file is authorized for external processing.
git diff --name-only origin/main...HEAD
git diff origin/main...HEAD -- src/components/copilot/a2ui/mde-ui-catalog.tsx
# If reviewed and approved for disclosure:
# supercov quality patch --base origin/main
# supercov security patch

# Investigate assertion strength before optional API spending:
supercov runs latest assertions assess --dry-run
```

For all commands: check help/installed version, review the file/diff contents **before** any externally backed call, and do not run live write operations merely to obtain a quality score. **Patch commands may inspect or send the entire branch diff**, not just the displayed `git diff -- <path>`; do not invoke them on a mixed or sensitive diff. The two-file Quicksilver example is illustrative; use it only after validating the exact installed CLI syntax and the specific files for disclosure.

## Real development scenarios

### SAN-1653 — Generated card opens the correct listing (worked example)

**Historical discovery, not an instruction to rerun a scan or a claim of current status.** A reported Quicksilver run scanned 385 files → 43 matches in 4.6 seconds for $0.0309. Its four leading paths were `src/components/copilot/a2ui/mde-ui-catalog.tsx`, `src/components/copilot/search-tool-result-cards.tsx`, `src/mastra/lib/recommendation-surface-bridge.ts` and `src/mastra/lib/rental-recommendations-ui.ts`. These paths are recorded here so agents on another machine can inspect them locally with `rg` and `git show`, **not** assume that an unavailable tool result was persisted. Verify their current relevance against [live SAN-1653](https://linear.app/amo100/issue/SAN-1653) and the latest `main`; PR #859 merged an earlier fix but does not by itself prove all A2UI cases.

1. Inspect the existing catalog/bridge and the native Details state owner. Diagnose any reproduced mismatch without creating a second renderer, modal, route or search engine.
2. **Eight required positive cases:** Rental **first, second, named, sixth** and Event **first, second, named, sixth** result. An unavailable sixth result must receive an honest unavailable outcome, not a fabricated ID.
3. In each positive case, distinguish a **new `render_ui` A2UI card** from native fallback cards and assert actual source-row ID = rendered card ID = opened native Details ID.
4. **Additional negative/recovery cases, not substitutes for the eight:** invalid/out-of-range/stale IDs, wrong thread/user, refresh/replay, cancellation and 390px.
5. Playwright and existing integration tests are definitive. Optional `jev_gate` may challenge an evidence summary, but it cannot certify ID equality or saved viewing transactions.

### SAN-1668 — Full pinned Standard Catalog

1. Compare the actual installed CopilotKit Standard Catalog export against MDE's one `mde/discovery@1` registry. Verify the advertised 69 count against installed types and runtime.
2. Mechanically classify present/missing/partial names first; `jev_classify` only for *ambiguous* component integration requirements.
3. Reuse SDK inheritance and MDE custom `RentalCard`/`EventCard`; preserve named Surface allowlists and real action boundaries.
4. Test malformed props, URLs/media, unavailable optional integrations, chat-wide exposure and 390px. **Catalog availability is not 69 working MDE workflows.**
5. Supercov on the catalog diff; ordinary tests prove actual schemas and renders.

### SAN-1658 — Reusable editable AI forms (workflow-specific examples)

**The live [SAN-1658](https://linear.app/amo100/issue/SAN-1658) issue owns its form contract and first pilot.** Follow its current acceptance criteria and pinned SDK behavior; this reference only explains how to select Jev tools. It does **not** mandate a particular form implementation or add partner-profile work to SAN-1658.

1. For the **viewing-request pilot**, inspect the existing Schedule Viewing modal, trusted listing lookup, native date/time validation and atomic submission. Use `jev_decide` only if genuine reuse options remain ambiguous. Test that the latest renter-edited value reaches the native review path, **no DB write occurs before native confirmation**, and an authorized retry yields exactly one lead/showing with correct broker access. Confirm the current native API and input contract instead of assuming the AI Form event carries the draft.
2. For **partner-profile reuse**, follow the separately owned [SAN-1663 — MDE Partner Dashboard — Review and Save AI-Suggested Business Profile Changes](https://linear.app/amo100/issue/SAN-1663) and its selected business/profile workflow, **not** Schedule Viewing. Reuse the existing partner profile form and authorized patch/save action. Verify AI draft → user edits/review → explicit save → readback for the **correct business**, plus cancel (no write), stale draft cleared on business switch, cross-business access denied, and retry/error behavior. Do **not** assert lead/showing creation for this workflow.
3. In either workflow, deterministic tests establish authorization, persistence, exact fields, idempotency and no premature writes. Use Jev Evals for subjective suggestion accuracy; Supercov for relevant assertion gaps. Do not introduce duplicate form state, providers or services.

### SAN-1659 — Reusable read-only dashboard insights panel

**[SAN-1659 — MDE AI — Add Reusable AI Insights Panels to Existing Dashboards](https://linear.app/amo100/issue/SAN-1659) owns the shared Surface/panel contract**, typed catalog components, authorization-safe integration, fallback and a first technical pilot on an existing host dashboard. It does **not** own or recalculate Host KPI metrics or a host-only analytics framework.

1. Inspect and reuse the shared `mde/discovery@1` catalog, existing page/agent providers and named Surface patterns. Keep the panel read-only and reusable across later domain dashboards.
2. Verify create/update/delete, allowlists, loading/empty/error fallback, role/thread isolation and 1440/768/390 responsive behavior with deterministic tests; use `jev_verify` only for ambiguous statements about supplied evidence.
3. For the **initial host demonstration**, reuse already-authorized HostOps rows and existing data functions **without copying KPI calculation logic into the shared panel**. Numeric equality/tenant isolation require source-backed assertions and RLS checks; Jev Evals may assess the accompanying explanation only.
4. **KPI and product ownership stays separate:** [SAN-761 — MDE Host Analytics — Show AI Results as Clear KPI Cards](https://linear.app/amo100/issue/SAN-761) owns existing host KPI cards, calculations and the KPI loader; [SAN-1661](https://linear.app/amo100/issue/SAN-1661) owns the Events product-facing interactive sales comparison. Do not treat shared-panel proof as completing either product task.

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

1. Quicksilver/externally backed code scans can upload selected source contents; Supercov patch commands can upload the complete scoped diff; Jev MCP/Evals can upload supplied evidence/state. **Inspect, narrow, and explicitly authorize every input before any upload**; remove secrets, cookies, bearer tokens, customer emails/phones/addresses, private attachments, sensitive code and service-role output. Prefer local tools when sanitizing would change the question or disclosure is not permitted.
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

**Maintenance:** The task examples above are illustrative (reviewed 11 Nov 2026), not execution instructions or completion reports. Re-check live Linear scope/status, current `main`, GitHub URLs, pinned SDK APIs, installed tool names and benchmarks before applying them. Never copy old acceptance counts or implementation decisions over live task criteria.
