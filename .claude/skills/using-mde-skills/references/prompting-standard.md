# MDE prompting standard

Use this standard for substantial Linear task prompts, skill instructions, and subagent delegation prompts. Keep simple S0/S1 work proportionally simple.

## Required structure for substantial prompts

1. **Role / owner** — who owns this step and what decision boundary they have.
2. **Goal** — one observable outcome.
3. **Context** — verified current state and source of truth.
4. **Inputs** — files, URLs, schemas, issue IDs, runtime evidence, or prior outputs.
5. **Instructions** — ordered actions only when order matters.
6. **Constraints** — scope, safety, ownership, and mutation boundaries.
7. **Dependencies** — facts or outputs that must already exist.
8. **Success criteria** — measurable conditions for completion.
9. **Verification** — exact commands, tests, runtime checks, or evidence.
10. **Evidence output** — what the next agent/reviewer/evaluator must receive.
11. **STOP conditions** — facts that invalidate the current path.
12. **Handoff** — exact next action if incomplete.

## Authoring rules

- Define success before adding instructions.
- Be clear and direct; avoid vague language such as “do this well” or “be thorough.”
- Explain important constraints when the reason improves judgment.
- Prefer positive instructions first; use negative boundaries for safety and routing.
- For reusable complex prompts, use 3–5 relevant, diverse examples when examples materially improve consistency.
- Use consistent XML-style sections when instructions, context, examples, and variable inputs would otherwise be ambiguous.
- For long multi-document inputs, put source material before the final query/instructions and preserve source labels.
- Separate requirement from proposed implementation.
- Use structured output contracts when another tool/agent consumes the result.
- Surface decisive command/test results in the response when `/goal` or another evaluator must judge them; the `/goal` evaluator does not independently read files or run commands.
- Do not force deep reasoning, exhaustive search, or subagents for simple work.
- Do not use prompt text to compensate for missing tools, permissions, bad data, or an invalid acceptance criterion.

## Quality gate

A prompt passes only when a fresh agent can identify the outcome, constraints, evidence, STOP conditions, and next action without hidden chat context. For reusable prompts, include at least one positive eval and one likely failure/over-trigger eval.

## Primary references

- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
- https://code.claude.com/docs/en/goal
