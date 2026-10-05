# Human-in-the-loop and suspend/resume

Read this when a Mastra agent must pause for approval, resume after a decision, or
survive a process boundary mid-run. This is the surface MDE's consequential writes
(listing publish, lead reply, import) build on, so get the shape right before
designing the approval flow.

## The two shapes

Mastra exposes approval at two levels. Pick the one that matches where the tool
lives, not which one you read about first.

| Shape | Use when | Entry point |
|---|---|---|
| Inline approval | One tool call inside a single generate/stream turn | `requireToolApproval` on the call |
| Durable agent | The run must survive a restart, or resume across turns | `createDurableAgent` |

## Inline approval

```ts
const output = await agent.generate("Publish listing 123", {
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

Approval proves *intent*. It never proves *authorization*. Every approved write must
still re-check, inside the backend path that performs it:

1. the authenticated user, and that they own the record (for rentals, `acting_landlord_ids()`);
2. the record's current version against the version the approval was granted for;
3. that the requested transition is legal from the record's current state;
4. idempotency, so a double click or a retried resume produces exactly one mutation.

A reject or cancel path must write nothing at all — assert that with row counts
rather than trusting the branch.

## Version caution

MDE runs one coherent stable Mastra family (see the package maturity table in
`SKILL.md`); the previous mixed alpha/beta surface and the `recall()` suppression are
gone. Re-read the installed type definitions before relying on any signature here.
