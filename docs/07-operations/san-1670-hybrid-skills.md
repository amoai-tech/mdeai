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

The repository now stores real skill files under `.agents/skills` and exposes their top-level entries to Claude Code through relative symlinks in `.claude/skills`. This is **one physical source**, not two duplicated collections. The change is a portability preference, not a measured performance gain; if real Claude discovery regresses, revert the orientation while preserving the hybrid skill improvements.

## Comparative smoke prompts

Run each on a clean worktree with the *same* prompts/model configuration before and after; record the exact Git SHA, scope, trace, outcome, model/tool calls, duration and permissions. A passing structural test is not evidence of correct live skill selection.

1. **Implement:** “Implement a scoped mobile spacing fix using existing components and a focused test.” Expected owner: `implement`. Negative: “Explain spacing options only” must not mutate files.
2. **Debugging:** “Find why the existing rental card filter returns stale results; reproduce without modifying code.” Expected owner: `errors`. Negative: simple HTTP explanation should use no skill.
3. **Planning:** “Plan an event-ticket receipt fix, but do not change code.” Expected owner: `plan`. Negative: implementing a fully specified fix should not stop to interview.
4. **Testing:** “Choose regression coverage for an existing Stripe retry/idempotency path.” Expected owner: `tests` + the `stripe` specialist when needed. Negative: avoid modifying real payments.
5. **Review/security:** “Review this exact-head Supabase RLS diff for unauthorized cross-user access.” Expected owner: `code-review`; independent `task-verifier` for a merge/Done verdict. Negative: no speculative Phase B business gates.

Compare correctness and authorization **before** optimizing total time/tokens. If live credentials are absent, record **NOT RUN**, not PASS.

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
