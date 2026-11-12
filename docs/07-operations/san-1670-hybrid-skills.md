# SAN-1670 — MDE hybrid agent skills

**Status:** Implementation evidence, not a production or model-success certification.
**Owner:** [SAN-1670](https://linear.app/amo100/issue/SAN-1670).

## One source and one workflow owner

MDE retains its existing small router in `using-mde-skills`; it selects **one** execution owner. Domain rules load only when needed. The repository's `AGENTS.md` is the authoritative Phase A security/development contract. A skill is not permission to add ownership, approval, viewing, publishing, or booking prerequisites in Phase A.

| MDE owners | Selected upstream technique | Action |
| --- | --- | --- |
| `plan`, `architect` | Addy Osmani planning; Matt Pocock's clarification/domain terms | Improve `plan`, keep `architect` for real architecture changes; ask only unresolved product questions |
| `implement` | Addy's incremental implementation | Upgrade existing `implement`: small vertical slices and proof per slice |
| `errors`, `systematic-debugging` | P Stack investigation; Matt Pocock's diagnosing-bugs | Improve `errors`, keep `systematic-debugging` as optional deep methodology |
| `tests`, `testing` | Matt TDD; P Stack verifiability | Improve `tests`, keep `testing` as execution owner |
| `code-review`, `review`, `praudit` | Addy's risk-focused code review; P Stack challenge of assumptions | Improve `code-review`; keep `review` for existing feedback, `praudit` for merge decision |
| `efficient`, `ponytail` | P Stack subtract-before-add | Improve `efficient`, keep `ponytail` for source receipts |
| `task-verifier` | Independent proof already present in MDE | Keep unchanged; author cannot self-certify S4/high-risk work |
| `supabase`, `mastra`, `copilotkit`, `stripe`, `maps`, `real-estate`, `events`, `linear-task`, `linear-audit` | Existing MDE specialist knowledge | Keep unchanged |

These are **targeted methodology additions**, not wholesale installations or claims of measured superiority. Do not delete overlapping-named skills when their distinct roles remain observable.

## Platform compatibility

| Agent surface | Discovery or distribution path | Evidence required |
| --- | --- | --- |
| Claude Code | Project `.claude/skills/<name>/SKILL.md`, including tested relative symlinks | Native skill invocation and trace |
| Codex | Project `.agents/skills/<name>/SKILL.md` | Native skill selection and trace |
| DeepSeek Harness | Native `skill-filesystem` project `.agents/skills` and `tool-skill` | Model-visible catalog + actual `skill` load |
| DSH Super Agent | Executor's **MDE Git checkout** must be workspace root of a DSH session | Verify inherited skill and a safe work-item result |
| ChatGPT web/Work/desktop | Supported ChatGPT skills or plugin distribution for the current account; **not** direct access to local Git symlinks | Installed plugin/skill execution. If unavailable, record limitation instead of asserting it works |

DSH's official [skills subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md) documents project `.dsh/skills` and `.agents/skills` sources, relative precedence and the model-facing `skill` tool. Use the existing DSH loader; do not build a second registry or Super Agent.

The current `.claude`-canonical / `.agents`-symlink mirror is **one physical source**, not two duplicated collections. Moving canonical files to `.agents` has no intrinsic speed benefit; preserve the working orientation if real Claude/Codex compatibility proof is missing.

## Migration decision — preserve working agent paths

The trial flip to physically canonical `.agents/skills` was **reverted** after the resulting 880-file GitHub PR exceeded CodeRabbit's 100-file review limit and the required PR-Agent scope guard failed closed on contradictory GitHub counts (880 file entries versus `changed_files=731`). Replacing that review guard with a permissive workaround would make completion claims weaker, not better. The existing **one-source** `.claude` canonical library with `.agents` relative-symlink exposure avoids duplicate physical copies. **Verified:** Claude Code and Codex read the MDE skill instructions (file reads, not skill selection). **Claude Code skill selection, 2026-11-11 (CLI 2.1.322, Skill tool only, one turn, small n):** `main` vs this PR chose the expected owner for 4/5 vs 5/5 positive prompts; `code-review` on an inline RLS diff fired 0/4 on `main` and 3/4 on this PR; `implement` never mis-fired on explain-only prompts; `testing` was never selected for "run the suite" (0/8, one false `tests` trigger on each side). Single-model, tiny sample: direction only, not a success rate. **Not verified:** DeepSeek Harness live skill invocation; the headless probe returned `MISSING_CREDENTIAL` for its configured `deepseek-official` provider, so native `.agents/skills` discovery remains a documented upstream capability rather than demonstrated in this MDE run. DSH Super Agent work-item use is also unverified. Do not attempt the high-churn path reversal as a prerequisite for improving or using skills. Reconsider only with a separately verified, safely reviewable migration mechanism and a real platform requirement.

## Comparative smoke prompts

Run each on a clean worktree with the *same* prompts/model configuration before and after; record the exact Git SHA, scope, trace, outcome, model/tool calls, duration and permissions. A passing structural test is not evidence of correct live skill selection.

1. **Implement:** “Implement a scoped mobile spacing fix using existing components and a focused test.” Expected owner: `implement`. Negative: “Explain spacing options only” must not mutate files.
2. **Debugging:** “Find why the existing rental card filter returns stale results; reproduce without modifying code.” Expected owner: `errors`. Negative: simple HTTP explanation should use no skill.
3. **Planning:** “Plan an event-ticket receipt fix, but do not change code.” Expected owner: `plan`. Negative: implementing a fully specified fix should not stop to interview.
4. **Testing:** “Choose regression coverage for an existing Stripe retry/idempotency path.” Expected owner: `tests` + the `stripe` specialist when needed. Negative: avoid modifying real payments.
5. **Review/security:** “Review this exact-head Supabase RLS diff for unauthorized cross-user access.” Expected owner: `code-review`; independent `task-verifier` for a merge/Done verdict. Negative: no speculative Phase B business gates.

Compare correctness and authorization **before** optimizing total time/tokens. If live credentials are absent, record **NOT RUN**, not PASS.

## Refined workflow boundaries

Each of the six revised skills now has a positive and nearby negative example, a **stop condition**, and explicit evidence requirements. Use the existing `using-mde-skills` router only when ownership is ambiguous. For example, `errors` diagnoses an unexplained Gemini tool failure; `tests` designs the regression; `testing` executes/grades it; `implement` owns authorized fixes. A single task can consult these references without running four independent task owners.

**Minimum evidence contract:** `changed path/outcome → exact test(s) actually run and result → unverified assumptions/blockers → one next step`. The diagnosis-only and planning skills must not claim code was implemented; test design must not claim tests were executed. Use independent `task-verifier` for S4 authorization, financial/retry or destructive changes. Business eligibility/approval paperwork is not an MDE Phase A prerequisite.

**Risk examples:** A CSS-only mobile fix needs focused UI and relevant 390px proof, not a full payment suite at every edit. A Stripe retry fix needs signature/auth checks, exact one-ticket/readback assertions, rollback/recovery and independent S4 verification. The same source-of-truth policy applies across all agent surfaces.

## Bounded behavior evaluation (reuse existing runner)

Start with the existing `implement`, `errors`, and `tests` positive/negative trigger cases; `plan` and `code-review` receive further live trials only when there are real work items. Run **baseline and candidate in separate clean worktrees at pinned commits**, with the same model, task, permissions and reasonable execution limits. Record each environment independently. Each run requires a real skill-load trace (not just an answer naming a skill). The existing runner grades **DSH v4 session traces only**. **Selection-only probe:** for Claude Code, use `claude -p "<prompt>" --tools Skill --max-turns 1 --setting-sources project --output-format stream-json --verbose </dev/null` (close stdin, or leftover input leaks into the prompt), and record `Skill` tool_use events; this command **cannot prove task success** because tools other than Skill are unavailable. **Behavior runs require normal tool access**, sufficient turns and bounded spend. Execute real focused checks and record owner selection, positive/near-miss behavior, outcome, denied actions, time, tool calls and tokens. Codex traces have no parser yet. Compare dollar cost only when an actual rate/billing source is available.

The existing runner supports `python3 scripts/run-skill-behavior-eval.py --skill implement --trigger-id 1 --run` and `--trace <saved-trace>`; inspect the current runner/skill IDs before choosing cases. For negative cases use the numeric fixture position: for fixture `implement-4`, run `--skill implement --trigger-id 4` (expected alternate owner: `plan`). Do not invent a new grader. **Timeout, exhausted usage, missing credentials or unavailable ChatGPT skills = NOT VERIFIED, never PASS.** Keep cross-host results separate from structural CI success and never call a hypothetical 95/100 target a measured success rate.

## November 12 discovery, overlap and cost evidence

**Do not consolidate skill folders based on shared vocabulary.** The top three overlapping pairs have distinct intended owners:

| Paired skills | Positive example | Nearby negative example |
| --- | --- | --- |
| `tests` / `testing` | Design retry/authorization cases → `tests` | Actually run Vitest and explain failures → `testing` |
| `errors` / `systematic-debugging` | Reproduce one concrete rental-price bug → `errors` | Deep intermittent cross-system race tracing → `systematic-debugging` methodology |
| `efficient` / `ponytail` | Find simplest existing RPC extension → `efficient` | Require pinned source receipts and reuse audit → `ponytail` |

**Root-cause fix:** A Claude Code session on the previous head exposed only **50 of 53** canonical skills; `testing`, `maps` and `real-estate` were absent because their `paths` activation globs required matching source-file context. Removing those globs made **53/53 appear in the observed session catalog**. The `tests`/ `testing` descriptions now distinguish coverage design from running tests/TDD. The shared router and its deterministic contract were updated; the symlink mirror remains unchanged.

**Advisory six-prompt semantic check:** Jev 1.14.0, judging the old versus revised *skill descriptions only*, chose the intended owner for **5/6 versus 6/6** prompts. The meaningful difference was a routine bug routed to `systematic-debugging` before and `errors` after. This **does not prove** native Claude/Codex selection, code correctness, cost savings or statistical accuracy.

**Live Claude Code paired benchmark: INCOMPLETE.** A read-only Sonnet baseline ran the design and test-execution prompts without invoking a skill; the quick-debug prompt did call `errors`, but terminated with a `max-budget` error after reporting about US$1.47 despite a US$0.60 requested cap. The remaining cases did not complete a usable turn. The candidate was not run after this failure to avoid further unexpected cost. No paired time/token or task-success improvement can be claimed. Re-run only with budget-controlled credentials, normal tool access and real executable tasks, preserving original traces for comparison.

**Stop decision:** Retain all three pairs until a completed before/after benchmark demonstrates no correctness/security regression and meaningful runtime savings. Prefer tightening descriptions and loading long references only on demand; never weaken Phase A technical security to make a smaller prompt.

## Repository verification

```sh
npm run check:skills
node --test scripts/__tests__/check-skill-layout.test.mjs scripts/__tests__/skill-evals-conformance.test.mjs scripts/__tests__/mde-short-skill-routing.test.mjs
```

Use real host sessions for independent behavior proof. **For ChatGPT**, installing a project GitHub folder does not automatically publish it to ChatGPT; use the actual supported distribution surface or mark it blocked.

## Sources

- Anthropic official [authoring guidance](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) and [skill creator](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/skill-creator/skills/skill-creator/SKILL.md).
- [Addy Osmani](https://github.com/addyosmani/agent-skills): planning/incremental implementation/review.
- [Matt Pocock](https://github.com/mattpocock/skills): clarification, test behavior and diagnosis.
- [P Stack](https://github.com/cursor/plugins/tree/main/pstack): root-cause investigation, simplicity, verifiability.
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and [DSH Super Agent](https://github.com/deepseek-ai/dsh-superagent-prototype).

External techniques are used as *patterns*. No external package is vendored or an upstream agent framework copied into MDE.
