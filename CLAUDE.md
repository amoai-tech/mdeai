# CLAUDE.md — MDE AI

@AGENTS.md

## Claude Code adapter

`AGENTS.md` is the canonical shared repository guidance. Do not duplicate its stack, routing, security, verification, or response-style rules here.

Claude-specific guidance:

- Use `.claude/skills/` for reusable procedures and specialist knowledge; `.claude/skills/INDEX.md` is the authoritative list.
- Use `.claude/rules/*.md` for Claude-specific rules that should not be global repository guidance. Scope a rule to a subtree with `paths:` frontmatter (`.claude/rules/supabase-changes.md` → `supabase/**`) so it loads only when those files are touched; a rule with no `paths` loads every session, so keep those few.
- Keep this wrapper small so Claude receives one shared source of repository truth. Prefer path-scoped rules over growing this file.
- When a shared rule changes, update `AGENTS.md`; change this file only for Claude-specific behavior.
