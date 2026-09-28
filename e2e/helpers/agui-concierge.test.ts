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
 * The two lifecycle events a healthy server echoes back: it copies the
 * threadId and runId it was handed, exactly as the CopilotKit route + Mastra
 * adapter do (`agent.threadId = input.threadId`, `runId: input.runId`).
 */
const echoLifecycle = (seen: Seen, type: string) => ({
  type,
  threadId: seen.body?.threadId,
  runId: seen.body?.runId,
});

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
      ok(res, sse([echoLifecycle(seen, "RUN_STARTED"), echoLifecycle(seen, "RUN_FINISHED")])),
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

  it("fails the request itself on a non-2xx reply", async () => {
    const { url } = await serve((_seen, res) => {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "no authenticated session" }));
    });
    await expect(runConciergeAgent({ url, threadId: THREAD })).rejects.toThrow();
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

  it("accepts a stream that echoes the requested threadId and generated runId", async () => {
    const { url, requests } = await serve((seen, res) =>
      ok(res, sse([echoLifecycle(seen, "RUN_STARTED"), echoLifecycle(seen, "RUN_FINISHED")])),
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

    await expect(
      runConciergeAgent({ url, threadId: THREAD, timeoutMs: 250 }),
    ).rejects.toThrow(/timed out/);
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
