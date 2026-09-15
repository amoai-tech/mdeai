# MDE skill routing map

`using-mde-skills` is a **router only**. It classifies complexity and hands work to an owner; it never becomes a second implementation lifecycle.

## Hierarchy

- **Build orchestrator:** `tasks`
- **Debug orchestrator:** `systematic-debugging`
- **Skill-authoring orchestrator:** `writing-skills`
- **Reasoning specialists:** `research`, `domain-modeling`, `codebase-design`, `wireframe`, `mermaid-diagrams`
- **Domain specialists:** Mastra, Supabase, Maps, Real Estate, Vercel, and other installed stack skills
- **Implementation/proof:** `tdd`, `testing`, `lean-dev-flow`
- **Independent critics:** `code-review`, `task-verifier`
- **Shipping mechanics:** `mde-worktree-pr-flow`

## Complexity

S0 = direct work; S1 = one primary skill; S2 = primary + specialists; S3 = dependency-aware orchestration; S4 = production-critical orchestration with adversarial verification.

## Conflict rules

- `tdd` drives test-first implementation; `testing` selects/runs/interprets proof.
- `code-review` evaluates diff/spec quality; `task-verifier` certifies completion and production safety.
- `systematic-debugging` owns unexplained failures before fixes are proposed.
- `tasks` owns scope/execution; `mde-worktree-pr-flow` owns Git mechanics.
- `mermaid-diagrams` loads only when relationships/state/sequence/failure paths are materially non-trivial.
- `mde-vercel` loads only for Vercel-specific deployment/runtime/performance concerns.

## Control loop inside `tasks`

Plan next dependency-safe step → select specialist → execute → observe evidence → update Linear state → continue, reroute, or stop. Do not force every optional specialist into every task.

## Parallel work

Parallelize independent discovery or implementation branches only when they share no unresolved contract and no order-sensitive side effect. Serialize dependency chains.
