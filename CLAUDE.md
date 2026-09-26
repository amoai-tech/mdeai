# CLAUDE.md — MDE AI

@AGENTS.md

## Claude Code adapter

`AGENTS.md` is the canonical shared repository guidance. Do not duplicate its stack, routing, security, verification, or response-style rules here.

Claude-specific guidance:

- Use `.claude/skills/` for reusable procedures and specialist knowledge.
- Use `.claude/rules/` only for Claude-specific or path-scoped rules that should not be global repository guidance.
- Keep this wrapper small so Claude receives one shared source of repository truth.
- When a shared rule changes, update `AGENTS.md`; change this file only for Claude-specific behavior.
