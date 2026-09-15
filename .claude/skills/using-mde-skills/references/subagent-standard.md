# MDE subagent standard

Use this when creating or delegating to project subagents under `.claude/agents/`. Skills provide reusable expertise; subagents provide isolated execution context, tool boundaries, and optional parallelism.

## Creation contract

Every MDE subagent must define:

- `name` — lowercase/hyphen identifier.
- `description` — when Claude should delegate to it.
- the smallest useful `tools` allowlist and any `disallowedTools`.
- `skills` only for expertise that must be preloaded; full skill content enters the subagent context.
- `maxTurns` when bounded work can otherwise sprawl.
- `isolation: worktree` for write-capable agents when isolation materially reduces collision risk.
- a body/system prompt containing outcome, scope, inputs, constraints, evidence, STOP conditions, and return format.

## Context rules

A normal subagent receives its own system prompt plus basic environment details, not the parent Claude Code system prompt. Do not assume parent instructions or conversation context are present. State all task-critical context in the delegation prompt or preload the exact skills required.

Project agents in `.claude/agents/` should be committed and reviewed with the code they govern. Use `omitClaudeMd: true` only when the delegation prompt and preloaded skills intentionally provide all required project context.

## Tool and mutation policy

- Researcher/reviewer/verifier agents are read-only unless a specific task proves mutation is required.
- Implementation agents receive write tools only for their delegated scope.
- S0 work uses no subagent. S1 normally stays in the main agent. S2 may use one isolated specialist. S3/S4 may fan out only dependency-independent work.
- Reviewer/verifier agents must not silently fix the artifact they certify; return findings/evidence to `tasks`.

## Parallelization

Parallelize only when dependencies are complete, outputs do not depend on one another, and workers do not mutate the same source of truth. Prefer parallel discovery/research; serialize schema/API/interface contracts and consequential side effects.

## Primary references

- https://code.claude.com/docs/en/sub-agents
- https://platform.claude.com/docs/en/managed-agents/agent-setup
- https://platform.claude.com/docs/en/managed-agents/tools
