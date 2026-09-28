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
  body?: { threadId?: string };
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
    const { url, requests } = await serve((_seen, res) =>
      ok(res, eventStream(["RUN_STARTED", "RUN_FINISHED"])),
    );

    await runConciergeAgent({ url, threadId: THREAD, agentId: "conciergeAgent" });

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("agent/run");
    expect(requests[0].params?.agentId).toBe("conciergeAgent");
    expect(requests[0].body?.threadId).toBe(THREAD);
  });
});

describe("SAN-1330 · a bare 200 does not certify the turn", () => {
  it("throws when the stream carries no RUN_FINISHED (agent/connect behaviour)", async () => {
    // Exactly what handleConnectAgent produces: 200, text/event-stream, and a
    // stream that ends without ever running the agent.
    const { url } = await serve((_seen, res) => ok(res, eventStream(["RUN_STARTED"])));
    const { events } = await runConciergeAgent({ url, threadId: THREAD });
    expect(events.map((e) => e.type)).toEqual(["RUN_STARTED"]);
    expect(() => assertRunCompleted(events)).toThrow(/RUN_FINISHED/);
  });

  it("throws when the stream is empty", async () => {
    const { url } = await serve((_seen, res) => ok(res, ""));
    const { events } = await runConciergeAgent({ url, threadId: THREAD });
    expect(() => assertRunCompleted(events)).toThrow(/RUN_STARTED/);
  });

  it("throws when RUN_STARTED is missing", async () => {
    const { url } = await serve((_seen, res) => ok(res, eventStream(["RUN_FINISHED"])));
    const { events } = await runConciergeAgent({ url, threadId: THREAD });
    expect(() => assertRunCompleted(events)).toThrow(/RUN_STARTED/);
  });

  it("throws on RUN_ERROR even when RUN_FINISHED also arrives", () => {
    const events = [
      { type: "RUN_STARTED" },
      { type: "RUN_ERROR", message: "model unavailable" },
      { type: "RUN_FINISHED" },
    ] as AgUiEvent[];
    expect(() => assertRunCompleted(events)).toThrow(/RUN_ERROR/);
  });

  it("fails the request itself on a non-2xx reply", async () => {
    const { url } = await serve((_seen, res) => {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "no authenticated session" }));
    });
    await expect(runConciergeAgent({ url, threadId: THREAD })).rejects.toThrow();
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

    const { events } = await runConciergeAgent({ url, threadId: THREAD });

    expect(events.map((e) => e.type)).toEqual(observed.map((e) => e.type));
    expect(events.some((e) => e.type === "STATE_DELTA")).toBe(true);
    expect(() => assertRunCompleted(events)).not.toThrow();
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
