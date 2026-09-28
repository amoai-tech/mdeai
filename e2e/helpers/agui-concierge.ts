import { randomUUID } from "node:crypto";
import {
  RunAgentInputSchema,
  runHttpRequest,
  transformHttpEventStream,
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

export type AgUiEvent = { type: string } & Record<string, unknown>;

export type ConciergeRunEnvelope = {
  method: "agent/run";
  params: { agentId: string };
  body: unknown;
};

export type ConciergeRunResult = { events: AgUiEvent[] };

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
 * Require that the run actually completed.
 *
 * A 200 proves nothing here: the AG-UI handler always answers 200 with
 * `text/event-stream`, and a failed run is signalled by the stream closing
 * without `RUN_FINISHED`. These three checks are the whole success condition.
 */
export function assertRunCompleted(events: AgUiEvent[]): void {
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
}

/**
 * Dispatch one authenticated `agent/run` and decode the AG-UI event stream.
 *
 * `headers` must carry the caller's session cookies: the route authorizes with a
 * server-side `auth.getUser()`, so a cookie-less fetch is a 401. Passing them
 * explicitly is what lets us keep the official transport while preserving
 * existing authentication.
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

  try {
    const envelope = buildConciergeRunEnvelope(
      buildRunAgentInput(threadId, content),
      agentId,
    );

    const events$ = transformHttpEventStream(
      runHttpRequest(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...headers,
        },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      }),
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
        reject(new Error(`agent/run timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return { events: await Promise.race([collected, timeout]) };
  } catch (error) {
    // A bare AbortError from the cancelled fetch is not useful on its own.
    if (timedOut) throw new Error(`agent/run timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
