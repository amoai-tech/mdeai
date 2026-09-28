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
  console.log(output.suspendPayload.toolName, output.suspendPayload.toolCallId);

  await agent.approveToolCallGenerate({
    runId: output.runId,
    toolCallId: output.suspendPayload.toolCallId,
  });
  // or: agent.declineToolCallGenerate({ runId, toolCallId })
}
```

`finishReason === "suspended"` is the signal, not an exception. Treat a missing
`runId` or `toolCallId` as a hard failure: resuming with an invented id is how an
approval silently attaches to the wrong call.

## Streaming

The suspension arrives as a chunk, so a streaming UI must branch on it rather than
assuming the stream only ends in text:

```ts
for await (const chunk of stream.fullStream) {
  if (chunk.type === "tool-call-suspended" && chunk.payload.toolName === "submit_plan") {
    const resumed = await agent.resumeStream({ action: "approved" }, { runId: stream.runId });
    for await (const c of resumed.textStream) process.stdout.write(c);
  }
}
```

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

MDE runs a mixed Mastra surface (see the package maturity table in `SKILL.md`).
`@mastra/memory` is on a prerelease line, so its `Memory` shape can differ from what
`@mastra/core` expects — the repo already carries a suppression for the
`recall()` return shape. Re-read the installed type definitions before relying on
any signature here.
