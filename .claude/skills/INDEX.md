# MDE skill inventory and routing

Canonical: [`.claude/skills/`](./) · Codex exposure: [`.agents/skills/`](../../.agents/skills/) · Ownership: [`AGENTS.md`](../../AGENTS.md).

**Snapshot:** PR routing-eval candidate built from `main` at `18bc3669fe13ae4acbcf8575c374e1cba91c727a` (2026-10-14). Refresh counts from the repository before citing them on later commits. This index documents current ownership and available *definitions*, not agent evaluation pass rates.

## Inventory

Each name below is an active canonical skill, exposed through a corresponding relative-symlink mirror. Categories organize discovery; for ambiguous requests, `using-mde-skills` routes to one owner, and the short requested workflow normally takes precedence over a deep/domain reference.

- **Routing and implementation (11):** [`using-mde-skills`](./using-mde-skills/SKILL.md), [`tasks`](./tasks/SKILL.md), [`implement`](./implement/SKILL.md), [`plan`](./plan/SKILL.md), [`architect`](./architect/SKILL.md), [`efficient`](./efficient/SKILL.md), [`ponytail`](./ponytail/SKILL.md), [`refactor`](./refactor/SKILL.md), [`cleanup`](./cleanup/SKILL.md), [`roadmap`](./roadmap/SKILL.md), [`outcomes`](./outcomes/SKILL.md).
- **Review, assurance, and release (11):** [`code-review`](./code-review/SKILL.md), [`review`](./review/SKILL.md), [`praudit`](./praudit/SKILL.md), [`task-verifier`](./task-verifier/SKILL.md), [`merge`](./merge/SKILL.md), [`prod`](./prod/SKILL.md), [`launch`](./launch/SKILL.md), [`progress`](./progress/SKILL.md), [`errors`](./errors/SKILL.md), [`systematic-debugging`](./systematic-debugging/SKILL.md), [`e2e`](./e2e/SKILL.md).
- **Testing and browser tooling (3):** [`tests`](./tests/SKILL.md), [`testing`](./testing/SKILL.md), [`playwright-cli`](./playwright-cli/SKILL.md).
- **Business and platform domains (10):** [`real-estate`](./real-estate/SKILL.md), [`events`](./events/SKILL.md), [`supabase`](./supabase/SKILL.md), [`mastra`](./mastra/SKILL.md), [`copilotkit`](./copilotkit/SKILL.md), [`gemini`](./gemini/SKILL.md), [`maps`](./maps/SKILL.md), [`cloudinary`](./cloudinary/SKILL.md), [`stripe`](./stripe/SKILL.md), [`nextjs`](./nextjs/SKILL.md).
- **Product design, docs, and authoring (11):** [`frontend-design`](./frontend-design/SKILL.md), [`uiux`](./uiux/SKILL.md), [`wireframe`](./wireframe/SKILL.md), [`mermaid`](./mermaid/SKILL.md), [`mermaid-diagrams`](./mermaid-diagrams/SKILL.md), [`docs`](./docs/SKILL.md), [`research`](./research/SKILL.md), [`prompt`](./prompt/SKILL.md), [`skills`](./skills/SKILL.md), [`writing-skills`](./writing-skills/SKILL.md), [`whatsapp`](./whatsapp/SKILL.md).
- **Issue lifecycle, migration, and analysis (4):** [`linear-task`](./linear-task/SKILL.md), [`linear-audit`](./linear-audit/SKILL.md), [`migration`](./migration/SKILL.md), [`codacy`](./codacy/SKILL.md).

## Distinct responsibilities

| Intent | Execution owner | Supporting boundary |
| --- | --- | --- |
| Unknown failure/root cause | `errors` | `systematic-debugging` for root-cause methodology |
| Existing code diff | `code-review` | `review` instead when responding to *existing* reviewer feedback |
| PR merge-readiness decision | `praudit` | `task-verifier` independently challenges completion |
| Implement a scoped change | `implement` | `tasks` for worktrees/PR lifecycle; domain skill for applicable rules |
| Define coverage vs run tests | `tests` vs `testing` | `e2e` owns a full user journey; `playwright-cli` runs browser mechanics |
| Post-merge check vs production certification | `merge` vs `prod` | `task-verifier` proves any final Done assertion |
| Rental, event, AI, or data contracts | `real-estate`, `events`, `mastra`, `supabase` | Do not replace the user-requested workflow owner with every mentioned domain |
| Skills authoring | `skills` / `writing-skills` | Keep distinct until paired agent benchmarks establish a safe consolidation |
| Diagrams | `mermaid` / `mermaid-diagrams` | Keep distinct until paired agent benchmarks establish a safe consolidation |

## Mechanical coverage (definitions, not agent executions)

| Metric | Current candidate | What is actually verified |
| --- | ---: | --- |
| Canonical active skills | **50** | Exists as `SKILL.md` with metadata |
| Mirrored symlink entries | **151** | File/directory exposures point back to canonical owners |
| Skills with behavioral `evals.json` | **29/50** | JSON definitions, not executed behavior tests |
| Skills with `trigger-evals.json` | **17/50** | Positive and near-miss case definitions, not routing pass rate |
| Defined trigger probes | **132** | Parsed cases across trigger files |
| Defined behavioral probes | **109** | Parsed cases across behavior files |
| Router `routing-evals.json` cases | **110** | Separate historical router-case format, not counted as trigger files |

The `npm run check:skills` command enforces skill/mirror layout and vendored upstream integrity. `node --test scripts/__tests__/skill-evals-conformance.test.mjs` checks case-file structure. Neither command actually invokes Claude/Codex for each case or establishes routing accuracy; that needs an agent-run benchmark on a stable commit.

**Next measurement:** execute a representative fixed set with real agent runtimes, grade correct owner/false triggers/unauthorized actions and compare a candidate to its baseline. Record attempts, passes/failures, token/tool use, and exact revision. Do not assign unmeasured quality scores.

**Consolidation status:** Retain `skills` + `writing-skills` and `mermaid` + `mermaid-diagrams` until measured improvement is repeatable. See [the paired baseline experiment](../../docs/07-operations/skill-overlap-benchmark-2026-10-14.md), which found some regressions; do not treat its limited single-prompt runs as global skill quality scores.
