import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { maybeSingleMock, fromMock, createServiceRoleClientMock } = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return {
    maybeSingleMock,
    fromMock,
    selectMock,
    eqMock,
    createServiceRoleClientMock: vi.fn(() => ({ from: fromMock })),
  };
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}));

import {
  ANONYMOUS_RESOURCE_ID,
  extractThreadId,
  readRequestedThreadId,
  resolveRequestedThread,
} from "./copilotkit-thread-ownership";

function post(body: unknown, url = "https://www.mdeai.co/api/copilotkit"): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("extractThreadId", () => {
  it("reads a non-empty string threadId", () => {
    expect(extractThreadId({ threadId: "abc" })).toBe("abc");
  });

  it("ignores missing, blank and non-string values", () => {
    expect(extractThreadId({})).toBeNull();
    expect(extractThreadId({ threadId: "   " })).toBeNull();
    expect(extractThreadId({ threadId: 42 })).toBeNull();
    expect(extractThreadId(null)).toBeNull();
    expect(extractThreadId("abc")).toBeNull();
  });

  // Regression: validating the trimmed value while returning the raw one let a
  // padded foreign thread ID miss the ownership lookup and skip the 403.
  it("returns the trimmed id so the lookup and the handler agree", () => {
    expect(extractThreadId({ threadId: "  abc  " })).toBe("abc");
    expect(extractThreadId({ threadId: "\tabc\n" })).toBe("abc");
  });
});

describe("readRequestedThreadId", () => {
  it("reads the threadId without consuming the original body", async () => {
    const req = post({ threadId: "abc", method: "agent/run" });
    expect(await readRequestedThreadId(req)).toBe("abc");
    // The handler must still be able to read the body afterwards.
    expect(await req.json()).toMatchObject({ threadId: "abc" });
  });

  it("returns null for GET (no body)", async () => {
    const req = new NextRequest("https://www.mdeai.co/api/copilotkit/info", { method: "GET" });
    expect(await readRequestedThreadId(req)).toBeNull();
  });

  it("returns null for a non-JSON body", async () => {
    const req = new NextRequest("https://www.mdeai.co/api/copilotkit", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not json",
    });
    expect(await readRequestedThreadId(req)).toBeNull();
  });

  it("returns null for a malformed JSON body", async () => {
    const req = new NextRequest("https://www.mdeai.co/api/copilotkit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not valid json",
    });
    expect(await readRequestedThreadId(req)).toBeNull();
  });
});

describe("resolveRequestedThread", () => {
  it("reports 'none' when the request names no thread", async () => {
    expect(await resolveRequestedThread(post({ method: "info" }))).toEqual({ kind: "none" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("reports 'new' when the named thread does not exist", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await resolveRequestedThread(post({ threadId: "fresh" }))).toEqual({
      kind: "new",
      threadId: "fresh",
    });
  });

  it("reports the owning resourceId for an existing thread", async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { id: "t1", resourceId: "user-a" },
      error: null,
    });
    expect(await resolveRequestedThread(post({ threadId: "t1" }))).toEqual({
      kind: "existing",
      threadId: "t1",
      resourceId: "user-a",
    });
  });

  it("preserves the shared anonymous owner so the gate can reject it", async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { id: "t1", resourceId: ANONYMOUS_RESOURCE_ID },
      error: null,
    });
    expect(await resolveRequestedThread(post({ threadId: "t1" }))).toMatchObject({
      kind: "existing",
      resourceId: ANONYMOUS_RESOURCE_ID,
    });
  });

  it("reports a null resourceId as unowned rather than as a new thread", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: "t1", resourceId: null }, error: null });
    expect(await resolveRequestedThread(post({ threadId: "t1" }))).toEqual({
      kind: "existing",
      threadId: "t1",
      resourceId: null,
    });
  });

  // Fail closed: an unverifiable lookup must never be treated as "new thread".
  it("throws when the service role client is unavailable", async () => {
    createServiceRoleClientMock.mockReturnValueOnce(null as never);
    await expect(resolveRequestedThread(post({ threadId: "t1" }))).rejects.toThrow(
      /service role client unavailable/i,
    );
  });

  it("throws when the ownership lookup fails", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(resolveRequestedThread(post({ threadId: "t1" }))).rejects.toThrow(
      /cannot verify thread ownership/i,
    );
  });
});
