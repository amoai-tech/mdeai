# Linear orchestration handoff

For substantial S2–S4 SAN work, keep this state in the live Linear issue/comment so another agent can resume without chat history:

```text
Complexity: S0/S1/S2/S3/S4
Current phase: <phase>
Completed checkpoints: <verified items>
Current outputs: <files/contracts/runtime artifacts>
Blockers: <none or exact blocker>
Next action: <single dependency-safe next step>
Exact head SHA: <sha>
Evidence: <tests/CI/runtime proof>
Residual risk: <known remaining risk>
```

Update only after evidence changes. If a checkpoint regresses, move it back to incomplete and reduce progress. Do not create a second execution-plan file just to mirror this state.
