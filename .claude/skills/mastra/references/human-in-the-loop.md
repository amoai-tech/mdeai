# Human-in-the-loop and suspend/resume

Read this only when a Mastra agent needs **optional user confirmation** or a real durable suspend/resume boundary. This is not a reason to add permissions or approval prerequisites. **Phase A:** rental search, viewings, publishing, imports, events and bookings must work without landlord/partner approval, ownership documents, property verification, photo-rights paperwork, or other business certification gates. Authenticated server-side authorization, data isolation, atomic writes and idempotency still apply. Confirm that the installed Mastra and AG-UI adapter expose the example APIs before selecting them.

## The two shapes

Mastra exposes approval at two levels. Pick the one that matches where the tool
lives, not which one you read about first.

| Shape | Use when | Entry point |
|---|---|---|
| Inline approval | One tool call inside a single generate/stream turn | `requireToolApproval` on the call |
| Durable agent | The run must survive a restart, or resume across turns | `createDurableAgent` |

## Inline approval

The following is a **vendor-API illustration**, not the existing MDE CopilotKit route or a required publishing gate. Verify this API in installed types before use; MDE's current browser-facing HITL adapter uses its established CopilotKit tool path.

```ts
const output = await agent.generate("Review the user's requested action", {
  requireToolApproval: true,
});

if (output.finishReason === "suspended") {
  const { toolName, toolCallId } = output.suspendPayload;

  // The decision comes from a person. The pause exists so that someone chooses,
  // so approving here without asking defeats the point of the pause — and an
  // agent that approves its own consequential write is exactly the failure this
  // surface is meant to prevent.
  const approved = await askHuman(`Run ${toolName}?`);

  const result = approved
    ? await agent.approveToolCallGenerate({ runId: output.runId, toolCallId })
    : await agent.declineToolCallGenerate({ runId: output.runId, toolCallId });
}
```

`finishReason === "suspended"` is the signal, not an exception. Treat a missing `runId`
as a hard failure: resuming with an invented id is how an approval silently attaches to
the wrong call.

## Streaming

The pending decision arrives as a chunk, so a streaming UI must branch on it rather
than assuming the stream only ends in text:

```ts
for await (const chunk of stream.fullStream) {
  if (chunk.type === "tool-call-approval" && chunk.payload.toolName === "submit_plan") {
    const approved = await askHuman(`Run ${chunk.payload.toolName}?`);
    const resumed = approved
      ? await agent.approveToolCall({ runId: stream.runId })
      : await agent.declineToolCall({ runId: stream.runId });
    for await (const c of resumed.textStream) process.stdout.write(c);
  }
}
```

Approval and suspension are **different chunks with different APIs**, and mixing them
is the most common mistake on this surface:

| | Approval (`requireToolApproval` / `requireApproval`) | Custom suspend (`suspend()` / `suspendSchema`) |
|---|---|---|
| Stream chunk | `tool-call-approval` | `tool-call-suspended` |
| Payload | `toolCallId`, `toolName`, `args` | the tool's `suspendSchema` shape |
| Continue with | `approveToolCall({ runId })` / `declineToolCall({ runId })` | `resumeStream(data, { runId })` |
| Non-streaming signal | `finishReason === "suspended"` | `finishReason === "suspended"` |

`toolCallId` is optional on both `approveToolCall` and `approveToolCallGenerate`, so
`runId` alone is enough for a single pending call. Pass it when more than one call
could be pending and you need to name the right one.

## Resuming across turns

`defaultOptions.autoResumeSuspendedTools: true` lets a suspended tool resume on a
later conversational turn using the agent's memory. Without memory configured the
approval has nowhere to live, so this option is only meaningful alongside a real
`Memory` instance.

## Durable runs

`createDurableAgent` from `@mastra/core/agent/durable` wraps an agent with durable
execution and resumable streams. Two options matter in review:

- `shouldPersistSnapshot` — by default Mastra persists `pending`, `paused`, and
  `suspended` (the human-in-the-loop states). A predicate that excludes `suspended`
  or `paused` logs a warning because it breaks resume.
- `cache: false` makes streams non-resumable. That is a deliberate trade, not a
  default worth accepting accidentally.

## MDE rules

HITL confirms a **user's intent** when that decision is actually needed. It never proves **server authorization** or creates a Phase A **business approval gate**. Do not add new prompts or mandatory suspensions solely because the framework supports them. Existing grant/revoke/approve controls can be tested without blocking normal development journeys.

For a consequential write, the **canonical backend/RPC**, not the frontend decision, must:

1. derive the actor/tenant from the authenticated server context; enforce server-side Super Admin privileges or normal scoped authorization, **without** demanding landlord/ownership verification or partner paperwork as a Phase A eligibility prerequisite;
2. recheck record ID, expected version/current state and technical constraints at commit time; do not resurrect deferred Phase B business eligibility or publication gates;
3. commit the transition atomically and idempotently, so a double click, retries, or resumed execution cannot duplicate a lead, showing, booking, order, ticket or payment;
4. return the **actual persisted outcome**. A denial or cancellation before commit must not write a row; if a write already completed before Stop, report the committed result truthfully rather than claiming it was reversed.

Verify negative cases using real status and row counts, not the model's explanation. Keep framework/tool integration tests in the existing upgrade tasks rather than building a second approval service.

## Version caution

MDE runs one coherent stable Mastra family (see the package maturity table in
`SKILL.md`); the previous mixed alpha/beta surface and the `recall()` suppression are
gone. Re-read the installed type definitions before relying on any signature here.
