# MDE skill inventory and routing

Canonical: [`.claude/skills/`](./) · Codex exposure: [`.agents/skills/`](../../.agents/skills/) · Ownership: [`AGENTS.md`](../../AGENTS.md).

**Snapshot:** 2026-11-10, extended from the 2026-11-05 inventory on GitHub `main` skill tree, verified with `npm run check:skills` and the skill conformance tests. Counts are definitions and mechanical structure, **not** measured agent success rates. Recompute after changes to the skill catalog.

## Inventory

Each name below is an active canonical skill, exposed through a corresponding relative-symlink mirror. Categories organize discovery; for ambiguous requests, `using-mde-skills` routes to one owner, and the short requested workflow normally takes precedence over a deep/domain reference.

- **Routing and implementation (11):** [`using-mde-skills`](./using-mde-skills/SKILL.md), [`tasks`](./tasks/SKILL.md), [`implement`](./implement/SKILL.md), [`plan`](./plan/SKILL.md), [`architect`](./architect/SKILL.md), [`efficient`](./efficient/SKILL.md), [`ponytail`](./ponytail/SKILL.md), [`refactor`](./refactor/SKILL.md), [`cleanup`](./cleanup/SKILL.md), [`roadmap`](./roadmap/SKILL.md), [`outcomes`](./outcomes/SKILL.md).
- **Review, assurance, and release (11):** [`code-review`](./code-review/SKILL.md), [`review`](./review/SKILL.md), [`praudit`](./praudit/SKILL.md), [`task-verifier`](./task-verifier/SKILL.md), [`merge`](./merge/SKILL.md), [`prod`](./prod/SKILL.md), [`launch`](./launch/SKILL.md), [`progress`](./progress/SKILL.md), [`errors`](./errors/SKILL.md), [`systematic-debugging`](./systematic-debugging/SKILL.md), [`e2e`](./e2e/SKILL.md).
- **Testing and browser tooling (3):** [`tests`](./tests/SKILL.md), [`testing`](./testing/SKILL.md), [`playwright-cli`](./playwright-cli/SKILL.md).
- **Business and platform domains (10):** [`real-estate`](./real-estate/SKILL.md), [`events`](./events/SKILL.md), [`supabase`](./supabase/SKILL.md), [`mastra`](./mastra/SKILL.md), [`copilotkit`](./copilotkit/SKILL.md), [`gemini`](./gemini/SKILL.md), [`maps`](./maps/SKILL.md), [`cloudinary`](./cloudinary/SKILL.md), [`stripe`](./stripe/SKILL.md), [`nextjs`](./nextjs/SKILL.md).
- **Upstream interaction-pattern adapters (3):** [`openmuse`](./openmuse/SKILL.md) for chat/cards/maps/mobile, [`opendots`](./opendots/SKILL.md) for review/edit/receipt, [`openbot`](./openbot/SKILL.md) for optional external computer-use coworker. Each augments the existing `copilotkit`/`mastra`/domain skills; none installs a new runtime.
- **Product design, docs, and authoring (11):** [`frontend-design`](./frontend-design/SKILL.md), [`uiux`](./uiux/SKILL.md), [`wireframe`](./wireframe/SKILL.md), [`mermaid`](./mermaid/SKILL.md), [`mermaid-diagrams`](./mermaid-diagrams/SKILL.md), [`docs`](./docs/SKILL.md), [`research`](./research/SKILL.md), [`prompt`](./prompt/SKILL.md), [`skills`](./skills/SKILL.md), [`writing-skills`](./writing-skills/SKILL.md), [`whatsapp`](./whatsapp/SKILL.md).
- **PStack-inspired outcome and assurance adapters (3):** [`poteto-mode`](./poteto-mode/SKILL.md) dispatches an explicitly requested outcome-first run to one canonical owner; [`interrogate`](./interrogate/SKILL.md) challenges a diff with reproducible evidence; [`correct`](./correct/SKILL.md) enforces prevention of repeated mistake classes. These are MDE adaptations, not the Cursor plugin.
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
| Optional PStack-style explicit invocation | `poteto-mode` (dispatch-only) | Routes to exactly one existing MDE owner; no Cursor/PStack runtime |
| Evidence-only adversarial review | `interrogate` | No merge verdict or fixes; `praudit` / `task-verifier` retain authority |
| Prevent proven repeated mistakes | `correct` | Prefer architecture, types and tests over adding prompt rules |
| Skills authoring | `skills` / `writing-skills` | Keep distinct until paired agent benchmarks establish a safe consolidation |
| Diagrams | `mermaid` / `mermaid-diagrams` | Keep distinct until paired agent benchmarks establish a safe consolidation |

## Mechanical coverage (definitions, not agent executions)

| Metric | Current candidate | What is actually verified |
| --- | ---: | --- |
| Canonical active skills | **56** | Exists as `SKILL.md` with metadata |
| Mirrored symlink entries | **170** | File/directory exposures point back to canonical owners |
| Skills with behavioral `evals.json` | **36/56** | JSON definitions, not executed behavior tests |
| Skills with `trigger-evals.json` | **24/56** | Positive and near-miss case definitions, not routing pass rate |
| Defined trigger probes | **180** | Parsed cases across trigger files |
| Defined behavioral probes | **158** | Parsed cases across behavior files |
| Router `routing-evals.json` cases | **110** | Separate historical router-case format, not counted as trigger files |

The `npm run check:skills` command enforces skill/mirror layout, links inside `SKILL.md` and nested supporting `references/**/*.md` documents, and vendored upstream integrity. A link must resolve **from the Markdown file containing it**, both in the canonical tree and the agent exposure mirror. `node --test scripts/__tests__/skill-evals-conformance.test.mjs scripts/__tests__/skill-behavior-runner.test.mjs scripts/__tests__/check-skill-layout.test.mjs` validates case schemas, negative controls, fake-tool-call rejection, and link regressions.

**Live evaluation remains separate:** `python3 scripts/run-skill-behavior-eval.py --skill errors --trigger-id 1 --run` starts a real DSH headless turn only with valid model credentials. The runner's negative `expected_owner: direct` case correctly expects **no skill call**, not a fictional `direct` tool. Do not claim runtime trigger accuracy from static tests; record the model, exact prompt, revision, trace, outcome, cost and permissions for each real run. If credentials are absent, report `not run` instead of converting fixture checks into a success rate.

**Latest live probes (2026-11-05):** see [skill maintenance verification](../../docs/07-operations/skill-maintenance-verification-2026-11-05.md). DSH lacked model credentials. Authenticated, read-only Codex **completed one direct-answer negative case correctly without calling a skill**. Positive debugging and S4 security cases opened the expected skills but timed out before completing. **No model-wide routing success rate can be calculated** from this sample.

**Next measurement:** execute a representative fixed set with real agent runtimes, grade correct owner/false triggers/unauthorized actions and compare a candidate to its baseline. Record attempts, passes/failures, token/tool use, and exact revision. Do not assign unmeasured quality scores.

**Consolidation status:** Retain `skills` + `writing-skills` and `mermaid` + `mermaid-diagrams` until measured improvement is repeatable. See [the paired baseline experiment](../../docs/07-operations/skill-overlap-benchmark-2026-10-14.md), which found some regressions; do not treat its limited single-prompt runs as global skill quality scores.
