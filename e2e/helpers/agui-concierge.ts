import { randomUUID } from "node:crypto";
import {
  RunAgentInputSchema,
  runHttpRequest,
  transformHttpEventStream,
  type RunAgentInput,
} from "@ag-ui/client";

/**
 * SAN-1330 — the CopilotKit envelope, and nothing else.
 *
 * `/api/copilotkit` speaks a CopilotKit-specific envelope:
 *
 *     { method: "agent/run", params: { agentId }, body: RunAgentInput }
 *
 * `HttpAgent` cannot produce it. Its `requestInit()` posts the RAW
 * `RunAgentInput` as the body — keys `threadId, runId, messages, tools,
 * context, state`, verified against @ag-ui/client@0.0.52 — with no `method` or
 * `params` wrapper, so pointing it at this route would not dispatch a run.
 *
 * So the envelope is the one piece of protocol we own, and everything around it
 * comes from the official primitives:
 *   - `RunAgentInputSchema`  validates the run input
 *   - `runHttpRequest`       performs the fetch and surfaces non-2xx as an error
 *   - `transformHttpEventStream` decodes the SSE stream into typed AG-UI events
 *
 * Decoding by hand (string-matching `"type":"RUN_FINISHED"`) is what let the
 * previous certification look healthy while asserting nothing: an SSE stream is
 * not a document to grep, it is a sequence of events to parse.
 */

/**
 * Decoded AG-UI events are open-ended, but the fields this helper reads are
 * named here so the identity check is type-checked rather than trusting an
 * index signature.
 */
export type AgUiEvent = {
  type: string;
  threadId?: string;
  runId?: string;
} & Record<string, unknown>;

export type ConciergeRunEnvelope = {
  method: "agent/run";
  params: { agentId: string };
  body: RunAgentInput;
};

/**
 * `threadId`/`runId` are the ids that were actually sent on the wire — read back
 * from the parsed envelope, not the pre-parse input, so a caller asserts against
 * the real request rather than a value it re-derived by hand.
 */
export type ConciergeRunResult = {
  events: AgUiEvent[];
  threadId: string;
  runId: string;
};

/** Build the AG-UI run input for one throwaway turn. */
export function buildRunAgentInput(threadId: string, content = "ping") {
  return {
    threadId,
    runId: randomUUID(),
    messages: [{ id: randomUUID(), role: "user", content }],
    tools: [],
    context: [],
    state: {},
  };
}

/**
 * Wrap a run input in the CopilotKit envelope.
 *
 * `RunAgentInputSchema.parse` throws on a malformed input (missing `threadId`,
 * a message without `id`, …) rather than letting a bad payload reach the route
 * and be judged there.
 */
export function buildConciergeRunEnvelope(
  input: unknown,
  agentId = "conciergeAgent",
): ConciergeRunEnvelope {
  return {
    method: "agent/run",
    params: { agentId },
    body: RunAgentInputSchema.parse(input),
  };
}

/**
 * Require that the run actually completed — and that it was OURS.
 *
 * A 200 proves nothing here: the AG-UI handler always answers 200 with
 * `text/event-stream`, and a failed run is signalled by the stream closing
 * without `RUN_FINISHED`. So the first three checks are about completeness.
 *
 * The fourth is about identity, and it is not optional. A stream can be
 * perfectly complete and still describe a different turn: an intermediary, a
 * stale thread, or a mis-routed request can hand back `RUN_STARTED` /
 * `RUN_FINISHED` for someone else's `threadId`, or for an earlier `runId` on the
 * same thread. Presence-only checks accept that and certify a turn that never
 * happened, so every lifecycle event must carry the `threadId` and `runId` this
 * request actually sent.
 *
 * Both ids are echoed by the real stack, so this does not weaken the check
 * against production: the CopilotKit route sets `agent.threadId = input.threadId`
 * and passes `input.runId` through, and the Mastra adapter emits
 * `{ type: RUN_STARTED | RUN_FINISHED, threadId, runId }` straight from that input.
 */
export function assertRunCompleted(
  events: AgUiEvent[],
  expected: { threadId: string; runId: string },
): void {
  const types = events.map((event) => event.type);
  const shown = types.join(", ") || "(no events)";

  const runError = events.find((event) => event.type === "RUN_ERROR");
  if (runError) {
    throw new Error(`agent/run reported RUN_ERROR: ${JSON.stringify(runError)}`);
  }
  if (!types.includes("RUN_STARTED")) {
    throw new Error(`agent/run never emitted RUN_STARTED; got: ${shown}`);
  }
  if (!types.includes("RUN_FINISHED")) {
    throw new Error(
      `agent/run never emitted RUN_FINISHED — a bare HTTP 200 does not certify the turn; got: ${shown}`,
    );
  }

  // Order is part of the contract. The server emits through AG-UI's own
  // `verifyEvents`, which refuses a stream whose first event is not RUN_STARTED,
  // so a reversed stream did not come from a healthy run.
  if (types.indexOf("RUN_FINISHED") < types.indexOf("RUN_STARTED")) {
    throw new Error(`agent/run emitted RUN_FINISHED before RUN_STARTED; got: ${shown}`);
  }

  // Identity is required of EVERY event that names a run, keyed off the fields
  // rather than a hardcoded type list.
  //
  // In AG-UI 0.0.52 only RUN_STARTED and RUN_FINISHED define `threadId`/`runId`:
  // RUN_ERROR, STEP_*, TEXT_MESSAGE_*, TOOL_CALL_*, STATE_* and RAW/CUSTOM
  // define none (verified against @ag-ui/core's schemas). So those two are the
  // only events that can carry an identity — but the schemas are `passthrough`,
  // so keying off the fields rather than the type also catches an implementation
  // that attaches an identity to some other event.
  //
  // `verifyEvents`, the SDK's own structural validator, never compares threadId
  // or runId: ordering is its job, identity is ours.
  for (const event of events) {
    const namesARun =
      event.type === "RUN_STARTED" ||
      event.type === "RUN_FINISHED" ||
      event.threadId !== undefined ||
      event.runId !== undefined;
    if (!namesARun) continue;
    if (event.threadId !== expected.threadId || event.runId !== expected.runId) {
      throw new Error(
        `agent/run emitted ${event.type} for a different run — expected ` +
          `threadId=${expected.threadId} runId=${expected.runId}, got ` +
          `threadId=${event.threadId ?? "<missing>"} runId=${event.runId ?? "<missing>"}; ` +
          `got: ${shown}`,
      );
    }
  }
}

/**
 * Dispatch one authenticated `agent/run` and decode the AG-UI event stream.
 *
 * `headers` must carry the caller's session cookies: the route authorizes with a
 * server-side `auth.getUser()`, so a cookie-less fetch is a 401. Passing them
 * explicitly is what lets us keep the official transport while preserving
 * existing authentication.
 *
 * Returns the ids that were actually sent, so `assertRunCompleted` can be called
 * on the very request that produced these events.
 */
export async function runConciergeAgent(options: {
  url: string;
  threadId: string;
  content?: string;
  agentId?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Promise<ConciergeRunResult> {
  const {
    url,
    threadId,
    content = "ping",
    agentId = "conciergeAgent",
    headers = {},
    timeoutMs = 120_000,
  } = options;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  // A stall is diagnosed from the operator's side, so the message names the
  // endpoint and thread. Cookies are never included.
  const timeoutMessage = () =>
    `agent/run timed out after ${timeoutMs}ms — url=${url} threadId=${threadId}`;

  try {
    const envelope = buildConciergeRunEnvelope(
      buildRunAgentInput(threadId, content),
      agentId,
    );

    const events$ = transformHttpEventStream(
      // @ag-ui/client 0.0.59 changed runHttpRequest from (url, init) to a single
      // thunk that performs the fetch. MDE's call is unchanged; only the shape is.
      runHttpRequest(() =>
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...headers,
          },
          body: JSON.stringify(envelope),
          signal: controller.signal,
        }),
      ),
    );
    const collected = new Promise<AgUiEvent[]>((resolve, reject) => {
      const events: AgUiEvent[] = [];
      events$.subscribe({
        next: (event) => events.push(event as AgUiEvent),
        error: (error) =>
          reject(error instanceof Error ? error : new Error(String(error))),
        complete: () => resolve(events),
      });
    });
    // The timeout below settles the race first, which would leave this rejection
    // unobserved. Swallow it here; the awaited branch still reports the failure.
    collected.catch(() => {});

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        // Abort with no reason: passing an Error here makes Node surface it as an
        // unhandled rejection alongside the observable error.
        controller.abort();
        reject(new Error(timeoutMessage()));
      }, timeoutMs);
    });

    return {
      events: await Promise.race([collected, timeout]),
      // Read back from the parsed envelope: these are the exact ids the server
      // was handed, so the caller can tie the stream it gets back to this request.
      threadId: envelope.body.threadId,
      runId: envelope.body.runId,
    };
  } catch (error) {
    // A bare AbortError from the cancelled fetch is not useful on its own.
    if (timedOut) throw new Error(timeoutMessage());
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
