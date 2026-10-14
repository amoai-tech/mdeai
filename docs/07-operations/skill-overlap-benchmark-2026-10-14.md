# Skill overlap benchmark — 2026-10-14

## Decision

**Do not consolidate yet.** Compared on the same clean GitHub main checkout (8707a7c5a), two speculative consolidations preserved the requested answer types but did not consistently improve model behavior or cost. Both skill pairs are retained.

Candidate tested:
- skills + writing-skills → writing-skills as single entry point; original short guide moved to on-demand references
- mermaid + mermaid-diagrams → mermaid-diagrams as sole entry point, short active skill and original 301-line guidance preserved on demand

The candidate was reverted in the same isolated worktree after benchmarking. No candidate deletion is part of the proposed PR.

## Measured Codex agent probes

Codex CLI, ChatGPT authentication, read-only sandbox, prompt held constant, one run per prompt. Token counts include cached tokens and are **not billing estimates**. Commands count repository or CLI commands the agent initiated. This is limited evidence, not statistically robust.

| Task | Baseline | Candidate | Assessment |
| --- | --- | --- | --- |
| Author skill with 3 positive + 2 negative triggers | 28.3 s; 4 commands; 168,397 input tokens | 31.3 s; 5 commands; 213,376 tokens | **Regressed** time, tokens, and steps |
| Mermaid rental flow with no-pin, authorization, and retry invariants | 49.9 s; 10 commands; 525,294 tokens | 38.4 s; 11 commands; 373,645 tokens | Faster and fewer tokens; one additional command |
| Safety prompt: no fabricated owner verification or coordinates | 12.7 s; 1 command; 57,233 tokens | 48.0 s; 9 commands; 608,890 tokens | **Severe efficiency regression**; no evidence of false claims |
| General Mermaid definition (baseline only) | 5.9 s; 0 commands; direct answer | Not retested | Correct no-skill behavior |
| Detailed pair-overlap analysis (baseline only) | Timed out at 65 s | Not retested | Inconclusive |

Both paired authoring answers included skill metadata and trigger examples. Both paired rental diagrams represented no-pin-for-missing-coordinates, authorization, and retry behavior. **No live Supabase / payment / GitHub writes were tested**. Codex occasionally loaded multiple guides or irrelevant parser internals, indicating unnecessary context/tool use.

**Claude Code:** local authentication status was loggedIn=false. Reauthentication is an interactive user action (claude auth login); no Claude comparison was possible, and no login bypass was attempted.

## Validation and next decision gate

1. Retain the two pairs until repeatable evaluations show accurate selection and safety across agents.
2. After Claude reauthentication, run at least 10 paired authoring and 10 paired Mermaid realistic scenarios on unchanged, isolated checkouts, including 3 negative near-misses and 3 authorization/retry/failure cases per family.
3. Grade task completion, false security/ownership claims, refusal to fabricate data, time, tokens, tool calls, and unauthorized writes.
4. Only consolidate a pair if the candidate has no correctness/safety regressions and a meaningful reduction in duplicated tool/context work, with all existing references/evals migrated.
5. Treat completed evaluations as evidence only when the actual agent has executed them; the skill-layout coverage count reports definitions, not pass rates.

## Related security status

At clean main, npm audit found 0 critical and 63 lower-severity findings. Full floor on clean main passed with non-production placeholder public environment variables. No production deployment was tested. Critical patches were already present on main, so no redundant dependency update is proposed.

Sources: https://agentskills.io/specification ; https://code.claude.com/docs/en/skills ; https://developers.openai.com/codex/skills
