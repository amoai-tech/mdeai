import { describe, expect, it, vi } from "vitest";
import {
  REQUEST_ID_HEADER,
  logTurnBoundary,
  observeTurnStream,
  resolveTurnCorrelation,
} from "../turn-correlation";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://mdeai.co/api/copilotkit", { headers });

describe("resolveTurnCorrelation", () => {
  it("uses a caller-supplied id as the attempt id, never as the server id", () => {
    const { attemptId, requestId } = resolveTurnCorrelation(
      request({ "x-mde-attempt-id": "abc12345-def" }),
    );
    expect(attemptId).toBe("abc12345-def");
    expect(requestId).not.toBe("abc12345-def");
  });

  it("accepts the generic x-request-id fallback for the attempt id", () => {
    const { attemptId } = resolveTurnCorrelation(request({ "x-request-id": "req_1234-5678" }));
    expect(attemptId).toBe("req_1234-5678");
  });

  it("rejects an unsafe id instead of logging it", () => {
    // Header values cannot contain newlines (the Fetch API rejects them), so the
    // representable risks are length, separators and path/quote characters.
    for (const unsafe of ["short", "x".repeat(65), "id with spaces", "../../etc/passwd", 'id"quote']) {
      const { attemptId, requestId } = resolveTurnCorrelation(request({ "x-mde-attempt-id": unsafe }));
      expect(attemptId).not.toBe(unsafe);
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("generates a UUID when the caller supplies nothing", () => {
    expect(resolveTurnCorrelation(request()).requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("measures elapsed time from the moment the turn started", () => {
    const correlation = resolveTurnCorrelation(request(), 1_000);
    expect(correlation.elapsedMs(1_250)).toBe(250);
    // A clock that moves backwards never reports negative latency.
    expect(correlation.elapsedMs(900)).toBe(0);
  });
});

describe("attempt id vs server id", () => {
  it("keeps a browser attempt id separate from the server-owned request id", () => {
    const { requestId, attemptId } = resolveTurnCorrelation(
      request({ "x-mde-attempt-id": "browser-1234-abcd" }),
    );
    expect(attemptId).toBe("browser-1234-abcd");
    // The server id is always its own UUID, so a caller cannot forge another user's id.
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId).not.toBe(attemptId);
  });
});

describe("observeTurnStream", () => {
  const readAll = async (response: Response) => {
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return chunks;
  };

  it("records stream completion with bytes and first-chunk latency", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const correlation = resolveTurnCorrelation(request(), Date.now());
    const body = new TextEncoder().encode('data: {"type":"TEXT_MESSAGE_CONTENT","delta":"hi"}\n\n');
    const observed = observeTurnStream(new Response(body, { status: 200 }), correlation);
    await readAll(observed);
    const lines = spy.mock.calls.map((call) => JSON.parse(String(call[0]).replace("[mde-turn] ", "")));
    spy.mockRestore();
    const done = lines.find((line) => line.status === "complete");
    expect(done).toBeDefined();
    expect(done.detail).toContain(`bytes=${body.byteLength}`);
    expect(done.requestId).toBe(correlation.requestId);
  });

  it("marks an empty 200 stream as empty rather than successful", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const correlation = resolveTurnCorrelation(request(), Date.now());
    const observed = observeTurnStream(new Response(new Uint8Array(0), { status: 200 }), correlation);
    await readAll(observed);
    const lines = spy.mock.calls.map((call) => JSON.parse(String(call[0]).replace("[mde-turn] ", "")));
    spy.mockRestore();
    // This is the exact B2 shape: HTTP 200, no assistant text.
    expect(lines.some((line) => line.status === "empty")).toBe(true);
  });
});

describe("logTurnBoundary", () => {
  it("writes one greppable line with no request content", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logTurnBoundary({ requestId: "abc12345-def", phase: "stream", durationMs: 1234.6, status: "ok" });
    const line = spy.mock.calls[0][0] as string;
    spy.mockRestore();
    expect(line).toContain("[mde-turn]");
    expect(line).toContain('"requestId":"abc12345-def"');
    expect(line).toContain('"phase":"stream"');
    expect(line).toContain('"durationMs":1235');
    // Parse it, rather than trusting a substring.
    const parsed = JSON.parse(line.replace("[mde-turn] ", ""));
    expect(parsed.requestId).toBe("abc12345-def");
    expect(parsed.durationMs).toBe(1235);
    expect(line).not.toContain("\n");
  });

  it("exposes the header name used on responses", () => {
    expect(REQUEST_ID_HEADER).toBe("x-mde-request-id");
  });
});

describe("observeTurnStream · metadata vs text", () => {
  const readAll = async (response: Response) => {
    const reader = response.body!.getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) return;
    }
  };
  const lastStatus = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls
      .map((call) => JSON.parse(String(call[0]).replace("[mde-turn] ", "")))
      .filter((line) => line.phase === "stream")
      .pop()?.status;

  it("does not call a metadata-only stream complete", async () => {
    // Exactly the B2 shape: the body carries events, but no assistant prose.
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const body = new TextEncoder().encode(
      'data: {"type":"RUN_STARTED"}\n\ndata: {"type":"RUN_FINISHED"}\n\n',
    );
    await readAll(observeTurnStream(new Response(body, { status: 200 }), resolveTurnCorrelation(request())));
    const status = lastStatus(spy);
    spy.mockRestore();
    expect(status).toBe("metadata_only");
  });

  it("marks a stream that carried assistant text as complete", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const body = new TextEncoder().encode(
      'data: {"type":"TEXT_MESSAGE_CONTENT","delta":"Hay dos opciones"}\n\n',
    );
    await readAll(observeTurnStream(new Response(body, { status: 200 }), resolveTurnCorrelation(request())));
    const status = lastStatus(spy);
    spy.mockRestore();
    expect(status).toBe("complete");
  });
});

describe("observeTurnStream · split marker", () => {
  it("still sees TEXT_MESSAGE_CONTENT when a read boundary splits it", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    // The marker is deliberately severed mid-token, as a real network chunk can do.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"TEXT_MESSAGE_CON'));
        controller.enqueue(encoder.encode('TENT","delta":"Hay dos"}\n\n'));
        controller.close();
      },
    });
    const observed = observeTurnStream(new Response(stream, { status: 200 }), resolveTurnCorrelation(request()));
    const reader = observed.body!.getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    const status = spy.mock.calls
      .map((call) => JSON.parse(String(call[0]).replace("[mde-turn] ", "")))
      .filter((line) => line.phase === "stream")
      .pop()?.status;
    spy.mockRestore();
    expect(status).toBe("complete");
  });
});
