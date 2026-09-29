// @vitest-environment node
import { createServer, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertRunCompleted,
  buildConciergeRunEnvelope,
  buildRunAgentInput,
  runConciergeAgent,
  type AgUiEvent,
} from "./agui-concierge";
import { classifyAgentError } from "@/mastra/lib/mastra-telemetry";

/**
 * SAN-1330 — failure-proof coverage for the CopilotKit/AG-UI certification call.
 *
 * Every case below is driven through a real local HTTP server rather than a
 * mocked transport, so the official `runHttpRequest` +
 * `transformHttpEventStream` path is exercised end to end. A test that only
 * asserted on a hand-built event array would not prove the decoder is wired up.
 */

type Envelope = {
  method?: string;
  params?: { agentId?: string };
  body?: { threadId?: string; runId?: string };
};

type Seen = Envelope & { url?: string };

const openServers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (openServers.length) await openServers.pop()!();
});

/** Start a server that records the envelope it receives and replies with `reply`. */
async function serve(reply: (seen: Seen, res: ServerResponse) => void) {
  const requests: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let seen: Seen = {};
      try {
        seen = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Seen;
      } catch {
        /* leave empty on a non-JSON body */
      }
      requests.push(seen);
      reply(seen, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  openServers.push(
    () =>
      new Promise<void>((resolve) => {
        // A stalled SSE test leaves the socket open; without this, close() waits
        // for a client that is never coming back.
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  );
  return { url: `http://127.0.0.1:${address.port}/api/copilotkit`, requests };
}

const sse = (events: unknown[]) =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");

const eventStream = (types: string[]) =>
  sse(types.map((type) => ({ type, threadId: "t", runId: "r" })));

/**
 * The exact SSE body a healthy server returns: it copies the threadId and runId
 * it was handed, exactly as the CopilotKit route + Mastra adapter do
 * (`agent.threadId = input.threadId`, `runId: input.runId`).
 *
 * Written out rather than fed through the generic `sse` loop: these two events
 * are the whole response, and keeping request-derived values out of a generic
 * loop keeps it obvious that nothing here interprets the payload.
 */
const echoTurn = (seen: Seen) =>
  `data: ${JSON.stringify({ type: "RUN_STARTED", threadId: seen.body?.threadId, runId: seen.body?.runId })}\n\n` +
  `data: ${JSON.stringify({ type: "RUN_FINISHED", threadId: seen.body?.threadId, runId: seen.body?.runId })}\n\n`;

const ok = (res: ServerResponse, body: string) => {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(body);
};

const THREAD = "san1330-test-thread";

describe("SAN-1330 · CopilotKit envelope", () => {
  it("builds agent/run, never agent/connect", () => {
    // agent/connect only opens an SSE stream and silently drops `messages`, so a
    // certification built on it can return 200 without the agent ever running.
    const envelope = buildConciergeRunEnvelope(buildRunAgentInput(THREAD));
    expect(envelope.method).toBe("agent/run");
    expect(envelope.method).not.toBe("agent/connect");
    expect(envelope.params.agentId).toBe("conciergeAgent");
  });

  it("rejects a malformed RunAgentInput before it reaches the route", () => {
    expect(() => buildConciergeRunEnvelope({ runId: "r", messages: [] })).toThrow();
    expect(() =>
      buildConciergeRunEnvelope({ threadId: THREAD, runId: "r", messages: [{ role: "user" }] }),
    ).toThrow();
    expect(() => buildConciergeRunEnvelope(buildRunAgentInput(THREAD))).not.toThrow();
  });

  it("sends the requested agentId and threadId on the wire", async () => {
    const { url, requests } = await serve((seen, res) =>
      ok(res, echoTurn(seen)),
    );

    await runConciergeAgent({ url, threadId: THREAD, agentId: "conciergeAgent" });

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("agent/run");
    expect(requests[0].params?.agentId).toBe("conciergeAgent");
    expect(requests[0].body?.threadId).toBe(THREAD);
  });
});

describe("SAN-1330 · a bare 200 does not certify the turn", () => {
  it.each<{ label: string; types: string[]; expected: RegExp }>([
    { label: "no RUN_FINISHED at all (agent/connect behaviour)", types: ["RUN_STARTED"], expected: /RUN_FINISHED/ },
    { label: "no events at all", types: [], expected: /RUN_STARTED/ },
    { label: "no RUN_STARTED", types: ["RUN_FINISHED"], expected: /RUN_STARTED/ },
  ])("throws when the stream has $label", async ({ types, expected }) => {
    // `handleConnectAgent` produces exactly this shape: 200, text/event-stream,
    // and a stream that ends without ever running the agent.
    const { url } = await serve((_seen, res) => ok(res, eventStream(types)));
    const { events, threadId, runId } = await runConciergeAgent({ url, threadId: THREAD });
    expect(events.map((e) => e.type)).toEqual(types);
    expect(() => assertRunCompleted(events, { threadId, runId })).toThrow(expected);
  });

  it("throws on RUN_ERROR even when RUN_FINISHED also arrives", () => {
    const events = [
      { type: "RUN_STARTED", threadId: THREAD, runId: "r" },
      { type: "RUN_ERROR", message: "model unavailable" },
      { type: "RUN_FINISHED", threadId: THREAD, runId: "r" },
    ] as AgUiEvent[];
    expect(() => assertRunCompleted(events, { threadId: THREAD, runId: "r" })).toThrow(/RUN_ERROR/);
  });

  it("throws when RUN_FINISHED arrives before RUN_STARTED", () => {
    // Order is part of the contract: the server emits through AG-UI's own
    // `verifyEvents`, which refuses a stream whose first event is not
    // RUN_STARTED. A reversed stream is therefore malformed, not a finished turn.
    const events = [
      { type: "RUN_FINISHED", threadId: THREAD, runId: "r" },
      { type: "RUN_STARTED", threadId: THREAD, runId: "r" },
    ] as AgUiEvent[];
    expect(() => assertRunCompleted(events, { threadId: THREAD, runId: "r" })).toThrow(
      /before RUN_STARTED/,
    );
  });

  it("fails the request itself on a non-2xx reply, keeping the real error", async () => {
    const { url } = await serve((_seen, res) => {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "no authenticated session" }));
    });
    // The transport error must survive verbatim. `collected.catch(() => {})` only
    // guards a rejection that arrives AFTER the race has settled; a failure that
    // arrives first is what the race rejects with, so it is never swallowed.
    await expect(runConciergeAgent({ url, threadId: THREAD })).rejects.toThrow(/HTTP 401/);
  });
});

/**
 * The stream must belong to THIS run. A completed stream for someone else's
 * thread — or a stale run on the same thread — proves the turn we asked for did
 * not happen, so presence-only checks are not a certification.
 */
describe("SAN-1330 · a completed stream must belong to the requested run", () => {
  const started = (over: Partial<AgUiEvent> = {}) =>
    ({ type: "RUN_STARTED", threadId: THREAD, runId: "run-1", ...over }) as AgUiEvent;
  const finished = (over: Partial<AgUiEvent> = {}) =>
    ({ type: "RUN_FINISHED", threadId: THREAD, runId: "run-1", ...over }) as AgUiEvent;

  it.each<{ label: string; first: AgUiEvent; last: AgUiEvent }>([
    { label: "RUN_FINISHED for another thread", first: started(), last: finished({ threadId: "someone-else" }) },
    { label: "RUN_FINISHED for another run on this thread", first: started(), last: finished({ runId: "other-run" }) },
    { label: "RUN_STARTED for another thread", first: started({ threadId: "someone-else" }), last: finished() },
    { label: "RUN_STARTED for another run on this thread", first: started({ runId: "other-run" }), last: finished() },
  ])("throws on $label", ({ first, last }) => {
    expect(() => assertRunCompleted([first, last], { threadId: THREAD, runId: "run-1" })).toThrow(
      /different run/,
    );
  });

  it("rejects a non-lifecycle event that names a different run", () => {
    // Only RUN_STARTED/RUN_FINISHED define threadId/runId in AG-UI 0.0.52, but
    // those schemas are `passthrough`. Keying identity off the FIELDS rather than
    // the event type means anything that names a run must name ours.
    const events = [
      { type: "RUN_STARTED", threadId: THREAD, runId: "run-1" },
      { type: "STEP_STARTED", stepName: "generate", threadId: "someone-else", runId: "run-1" },
      { type: "RUN_FINISHED", threadId: THREAD, runId: "run-1" },
    ] as AgUiEvent[];
    expect(() => assertRunCompleted(events, { threadId: THREAD, runId: "run-1" })).toThrow(
      /different run/,
    );
  });

  it("accepts a stream that echoes the requested threadId and generated runId", async () => {
    const { url, requests } = await serve((seen, res) =>
      ok(res, echoTurn(seen)),
    );

    const { events, threadId, runId } = await runConciergeAgent({ url, threadId: THREAD });

    // The helper reports the ids it actually sent, so the caller asserts against
    // the real request rather than a value it re-derived by hand.
    expect(threadId).toBe(THREAD);
    expect(runId).toBe(requests[0].body?.runId);
    expect(runId).not.toBe("");
    expect(() => assertRunCompleted(events, { threadId, runId })).not.toThrow();
  });

  it("rejects a real completed stream that belongs to another thread", async () => {
    const { url } = await serve((_seen, res) =>
      ok(
        res,
        sse([
          { type: "RUN_STARTED", threadId: "another-thread", runId: "another-run" },
          { type: "RUN_FINISHED", threadId: "another-thread", runId: "another-run" },
        ]),
      ),
    );

    const { events, threadId, runId } = await runConciergeAgent({ url, threadId: THREAD });

    expect(events.map((e) => e.type)).toEqual(["RUN_STARTED", "RUN_FINISHED"]);
    expect(() => assertRunCompleted(events, { threadId, runId })).toThrow(/different run/);
  });
});

describe("SAN-1330 · transport and decoding use the official primitives", () => {
  it("decodes every event type observed in production, including STATE_DELTA", async () => {
    const observed = [
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      { type: "TOOL_CALL_START", toolCallId: "c1", toolCallName: "search_rentals" },
      { type: "TOOL_CALL_ARGS", toolCallId: "c1", delta: "{}" },
      { type: "TOOL_CALL_END", toolCallId: "c1" },
      { type: "TOOL_CALL_RESULT", toolCallId: "c1", content: "{}", messageId: "m2", role: "tool" },
      { type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "hi" },
      { type: "TEXT_MESSAGE_END", messageId: "m1" },
      { type: "STATE_SNAPSHOT", snapshot: { a: 1 } },
      { type: "STATE_DELTA", delta: [{ op: "add", path: "/b", value: 2 }] },
      { type: "RUN_FINISHED", threadId: "t", runId: "r" },
    ];
    const { url } = await serve((_seen, res) => ok(res, sse(observed)));

    const { events } = await runConciergeAgent({ url, threadId: "t" });

    expect(events.map((e) => e.type)).toEqual(observed.map((e) => e.type));
    expect(events.some((e) => e.type === "STATE_DELTA")).toBe(true);
    expect(() => assertRunCompleted(events, { threadId: "t", runId: "r" })).not.toThrow();
  });

  it("aborts a stalled stream instead of hanging", async () => {
    const { url } = await serve((_seen, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      // Well-formed RUN_STARTED: the decoder verifies event shape, so a bare
      // { type } would be rejected for a missing threadId/runId and mask the
      // stall this test is about.
      res.write(sse([{ type: "RUN_STARTED", threadId: THREAD, runId: "r" }]));
      // never end: the run stalls
    });

    // A stall has to be diagnosable from the failure alone, so the message names
    // the endpoint and the thread (never the cookies).
    const stalled = runConciergeAgent({ url, threadId: THREAD, timeoutMs: 250 });
    await expect(stalled).rejects.toThrow(/timed out after 250ms/);
    await expect(stalled).rejects.toThrow(`threadId=${THREAD}`);
    await expect(stalled).rejects.toThrow(`url=${url}`);
  }, 10_000);

  it("rejects a malformed event rather than certifying a garbled stream", async () => {
    // transformHttpEventStream verifies event shape, so an event missing its
    // required fields fails the run instead of being counted as progress.
    const { url } = await serve((_seen, res) =>
      ok(res, sse([{ type: "RUN_STARTED" }, { type: "RUN_FINISHED" }])),
    );
    await expect(runConciergeAgent({ url, threadId: THREAD })).rejects.toThrow();
  });
});

/**
 * SAN-1301 · MDE-CK-UPGRADE-001 — the Stop contract.
 *
 * The telemetry half already exists: `classifyAgentError` maps an `AbortError`
 * to `client_abort` (`src/mastra/lib/mastra-telemetry.test.ts`). These cases
 * cover the transport half — that cancelling an active run actually terminates
 * it and that nothing arrives afterwards, which is what "no post-abort result"
 * means in practice.
 */
describe("SAN-1301 · Stop cancels the active run and nothing arrives after it", () => {
  it("terminates the run on Stop and certifies nothing as success", async () => {
    const { url } = await serve((_seen, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(sse([{ type: "RUN_STARTED", threadId: THREAD, runId: "r" }]));
      // This frame is scheduled to arrive AFTER Stop is pressed. Observing it
      // would be exactly the bug: a post-abort assistant/tool result.
      setTimeout(() => {
        try {
          res.write(sse([{ type: "RUN_FINISHED", threadId: THREAD, runId: "r" }]));
        } catch {
          // The abort already tore down the socket.
        }
      }, 400);
      // Deliberately never ends: the run is still active when Stop happens.
    });

    const controller = new AbortController();
    const seen: string[] = [];
    const run = runConciergeAgent({
      url,
      threadId: THREAD,
      signal: controller.signal,
      onEvent: (event: AgUiEvent) => seen.push(event.type),
    });

    await new Promise((resolve) => setTimeout(resolve, 120)); // let RUN_STARTED land
    controller.abort();

    // `@ag-ui/client` 0.0.59 surfaces a client abort as a structured RUN_ERROR
    // and completes the stream, so the helper resolves rather than rejecting.
    const { events } = await run;
    const types = events.map((event) => event.type);
    expect(types).toContain("RUN_ERROR");
    expect(types).not.toContain("RUN_FINISHED");

    // The decisive assertion: an aborted turn can never be certified as success.
    expect(() => assertRunCompleted(events, { threadId: THREAD, runId: "r" })).toThrow(
      /RUN_ERROR/,
    );

    // Wait past the scheduled frame: nothing may arrive after the abort settled.
    const settled = seen.length;
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(seen.length).toBe(settled);
    expect(seen).not.toContain("RUN_FINISHED");
  }, 10_000);

  it("records a Stop as a client abort, not a stall or a failure", async () => {
    const { url } = await serve((_seen, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(sse([{ type: "RUN_STARTED", threadId: THREAD, runId: "r" }]));
    });

    const controller = new AbortController();
    const run = runConciergeAgent({
      url,
      threadId: THREAD,
      signal: controller.signal,
      // Long enough that a timeout cannot be the cause of what follows.
      timeoutMs: 5_000,
    });

    await new Promise((resolve) => setTimeout(resolve, 120));
    controller.abort();

    const { events } = await run;
    const abortEvent = events.find((event) => event.type === "RUN_ERROR") as
      | { code?: string; rawEvent?: unknown }
      | undefined;

    expect(abortEvent, "a Stop must surface as a structured RUN_ERROR").toBeDefined();
    expect(abortEvent?.code).toBe("abort");

    // Tie the transport event to the classifier the runtime records the turn with:
    // a Stop is a client abort, never a timeout and never a generic failure.
    expect(classifyAgentError(abortEvent?.rawEvent)).toBe("client_abort");
    expect(classifyAgentError(abortEvent?.rawEvent)).not.toBe("timeout");
  }, 10_000);

  it("still completes normally when no Stop is pressed", async () => {
    // Negative control: the abort wiring must not disturb the happy path.
    const { url } = await serve((_seen, res) =>
      ok(
        res,
        `data: ${JSON.stringify({ type: "RUN_STARTED", threadId: THREAD, runId: "r" })}\n\n` +
          `data: ${JSON.stringify({ type: "RUN_FINISHED", threadId: THREAD, runId: "r" })}\n\n`,
      ),
    );
    const controller = new AbortController();
    const { events } = await runConciergeAgent({
      url,
      threadId: THREAD,
      signal: controller.signal,
    });
    expect(events.map((e) => e.type)).toEqual(["RUN_STARTED", "RUN_FINISHED"]);
  }, 10_000);
});
