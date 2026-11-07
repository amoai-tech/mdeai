import { describe, expect, it, vi } from "vitest";
import {
  REQUEST_ID_HEADER,
  logTurnBoundary,
  resolveTurnCorrelation,
} from "../turn-correlation";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://mdeai.co/api/copilotkit", { headers });

describe("resolveTurnCorrelation", () => {
  it("honours a caller-supplied id so browser and server share one value", () => {
    const { requestId } = resolveTurnCorrelation(request({ "x-mde-request-id": "abc12345-def" }));
    expect(requestId).toBe("abc12345-def");
  });

  it("accepts the generic x-request-id fallback", () => {
    const { requestId } = resolveTurnCorrelation(request({ "x-request-id": "req_1234-5678" }));
    expect(requestId).toBe("req_1234-5678");
  });

  it("rejects an unsafe id instead of logging it", () => {
    // Header values cannot contain newlines (the Fetch API rejects them), so the
    // representable risks are length, separators and path/quote characters.
    for (const unsafe of ["short", "x".repeat(65), "id with spaces", "../../etc/passwd", 'id"quote']) {
      const { requestId } = resolveTurnCorrelation(request({ "x-mde-request-id": unsafe }));
      expect(requestId).not.toBe(unsafe);
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

describe("logTurnBoundary", () => {
  it("writes one greppable line with no request content", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logTurnBoundary({ requestId: "abc12345-def", phase: "run", durationMs: 1234.6, status: "ok" });
    const line = spy.mock.calls[0][0] as string;
    spy.mockRestore();
    expect(line).toContain("[mde-turn]");
    expect(line).toContain('"requestId":"abc12345-def"');
    expect(line).toContain('"phase":"run"');
    expect(line).toContain('"durationMs":1235');
    expect(line).not.toContain("\n");
  });

  it("exposes the header name used on responses", () => {
    expect(REQUEST_ID_HEADER).toBe("x-mde-request-id");
  });
});
