# MDE Gemini managed agents

Use this reference when a request proposes Gemini managed agents, remote agent environments, agent credentials, or agent hooks.

## Architecture rule

Gemini managed agents are not MDE's default orchestration layer.

Current MDE remains:

```text
Next.js
→ CopilotKit
→ Mastra
→ @ai-sdk/google
```

Adopt a Gemini managed agent only when a concrete requirement needs a capability that the current Mastra-based runtime does not provide well enough, such as:

- Google-hosted sandbox execution;
- managed environment lifecycle;
- managed credentials for supported external systems;
- agent hooks or managed-agent controls unavailable through the current architecture.

## Required architecture review

Before adoption, document:

- why Mastra cannot satisfy the requirement cleanly;
- whether this creates duplicate orchestration/state;
- authentication and authorization boundaries;
- tenant isolation;
- credential scope, storage, rotation, and revocation;
- data retention and privacy implications;
- auditability and observability;
- cancellation, timeout, and failure recovery;
- cost and concurrency limits;
- which system owns tool execution and persisted mutations.

## Credentials

Treat managed-agent credentials as privileged infrastructure.

- Grant least privilege.
- Never place long-lived secrets in prompts or browser-visible state.
- Keep MDE authorization checks server-side even when a managed agent can authenticate to an external service.
- User approval expresses intent; it does not replace backend authorization.

Official reference: https://ai.google.dev/gemini-api/docs/agent-credentials

## Agent hooks

Use hooks for policy enforcement, lifecycle instrumentation, and observability only when the managed-agent architecture has been explicitly adopted.

Do not move existing MDE authorization or business invariants into optional hooks if the authenticated backend already enforces them.

Official reference: https://ai.google.dev/gemini-api/docs/agent-hooks

## Agent environments

Remote environments can be useful for sandboxed execution, but they add a second execution/runtime boundary. Confirm lifecycle, network access, data exposure, cleanup, and tenant isolation before use.

Official reference: https://ai.google.dev/gemini-api/docs/agent-environment
