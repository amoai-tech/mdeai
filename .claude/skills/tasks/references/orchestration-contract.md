# Build orchestration contract

`tasks` is the formal build orchestrator for substantial MDE SAN work.

Machine-readable schema: `shared/orchestration-step.schema.json`.

For every S2–S4 task, represent each executable step with:

```yaml
step_id: S1
skill: supabase
action: Add and verify booking migration
inputs: [verified schema, Linear acceptance criteria]
outputs: [migration, generated contract, verification evidence]
depends_on: []
can_parallel: false
on_failure: abort
```

## Rules

- Outputs are explicit handoff artifacts, not vague prose.
- `depends_on` defines the real execution graph.
- Parallel work is allowed only when dependencies are complete and no shared mutable contract is unresolved.
- After every verified checkpoint, persist state in Linear using `linear-handoff.md`.
- A failed decisive test reroutes to `systematic-debugging`; security/RLS/payment/schema blockers stop the build.
- Optional research may be skipped only when the limitation is recorded and does not invalidate Definition of Done.
