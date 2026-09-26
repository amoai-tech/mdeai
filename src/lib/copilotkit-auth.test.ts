import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { assertCopilotKitAuthorized, evaluateCopilotKitAuth } from "./copilotkit-auth";
import { ANONYMOUS_RESOURCE_ID } from "./copilotkit-thread-ownership";

/**
 * SAN-1358 · D20. The previous suite *asserted the vulnerability was correct*
 * ("allows any request when COPILOTKIT_API_KEY is unset" and "allows same-origin
 * browser POST in production without bearer"). Both are now inverted, and the
 * same-origin bypass is pinned as a regression.
 */

const KEY = "service-secret-value";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function request(init: {
  method?: string;
  headers?: Record<string, string>;
  url?: string;
} = {}): NextRequest {
  return new NextRequest(init.url ?? "https://www.mdeai.co/api/copilotkit", {
    method: init.method ?? "POST",
    headers: init.headers,
  });
}

/** A request a browser on the real origin would send — routing context only. */
const sameOrigin = {
  origin: "https://www.mdeai.co",
  host: "www.mdeai.co",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("service bearer path", () => {
  it("allows a matching bearer", () => {
    vi.stubEnv("COPILOTKIT_API_KEY", KEY);
    const result = evaluateCopilotKitAuth(
      request({ headers: { authorization: `Bearer ${KEY}` } }),
      { userId: null },
    );
    expect(result).toEqual({ allowed: true, via: "service-bearer" });
  });

  it("rejects an invalid bearer with 401", () => {
    vi.stubEnv("COPILOTKIT_API_KEY", KEY);
    const result = evaluateCopilotKitAuth(
      request({ headers: { authorization: "Bearer not-the-key" } }),
      { userId: null },
    );
    expect(result).toMatchObject({ allowed: false, status: 401 });
  });

  // INVERTED — previously "allows any request when COPILOTKIT_API_KEY is unset".
  it("rejects a bearer when the key is not configured (401, never fail-open)", () => {
    vi.stubEnv("COPILOTKIT_API_KEY", "");
    const result = evaluateCopilotKitAuth(
      request({ headers: { authorization: `Bearer ${KEY}` } }),
      { userId: null },
    );
    expect(result).toMatchObject({ allowed: false, status: 401 });
    expect(result.allowed === false && result.reason).toContain("not configured");
  });

  it("treats a whitespace-only key as unconfigured", () => {
    vi.stubEnv("COPILOTKIT_API_KEY", "   ");
    const result = evaluateCopilotKitAuth(
      request({ headers: { authorization: `Bearer ${KEY}` } }),
      { userId: null },
    );
    expect(result).toMatchObject({ allowed: false, status: 401 });
  });

  it("never lets a bearer claim bypass ownership for a foreign thread", () => {
    vi.stubEnv("COPILOTKIT_API_KEY", "");
    // An unvalidatable bearer must not fall through to the browser path.
    const result = evaluateCopilotKitAuth(
      request({ headers: { authorization: "Bearer junk" } }),
      { userId: USER_A, thread: { kind: "existing", threadId: "t", resourceId: USER_B } },
    );
    expect(result).toMatchObject({ allowed: false, status: 401 });
  });
});

describe("browser path — identity and ownership", () => {
  it("rejects an unauthenticated caller with 401", () => {
    const result = evaluateCopilotKitAuth(request(), { userId: null });
    expect(result).toMatchObject({ allowed: false, status: 401 });
  });

  // INVERTED/REGRESSION — previously "allows same-origin browser POST in production
  // without bearer". Same-origin alone must no longer authorize anything.
  it("does not authorize on same-origin headers alone", () => {
    const result = evaluateCopilotKitAuth(request({ headers: sameOrigin }), { userId: null });
    expect(result).toMatchObject({ allowed: false, status: 401 });
  });

  it("cannot be spoofed by a matching Origin and Host pair", () => {
    // Exactly what `curl -H 'Origin: https://www.mdeai.co' -H 'Host: www.mdeai.co'` sends.
    const result = evaluateCopilotKitAuth(
      request({ headers: { ...sameOrigin, authorization: undefined as unknown as string } }),
      { userId: null },
    );
    expect(result).toMatchObject({ allowed: false, status: 401 });
  });

  it("allows an authenticated caller to create a new thread", () => {
    expect(
      evaluateCopilotKitAuth(request({ headers: sameOrigin }), {
        userId: USER_A,
        thread: { kind: "new", threadId: "fresh" },
      }),
    ).toEqual({ allowed: true, via: "new-thread" });
  });

  it("allows an authenticated caller to use a thread they own", () => {
    expect(
      evaluateCopilotKitAuth(request(), {
        userId: USER_A,
        thread: { kind: "existing", threadId: "t", resourceId: USER_A },
      }),
    ).toEqual({ allowed: true, via: "thread-owner" });
  });

  it("returns 403 for a thread owned by another user", () => {
    const result = evaluateCopilotKitAuth(request({ headers: sameOrigin }), {
      userId: USER_A,
      thread: { kind: "existing", threadId: "t", resourceId: USER_B },
    });
    expect(result).toMatchObject({ allowed: false, status: 403 });
  });

  it("rejects an existing thread on the shared anonymous resource (D17)", () => {
    const result = evaluateCopilotKitAuth(request({ headers: sameOrigin }), {
      userId: USER_A,
      thread: { kind: "existing", threadId: "t", resourceId: ANONYMOUS_RESOURCE_ID },
    });
    expect(result).toMatchObject({ allowed: false, status: 401 });
  });

  it("rejects an existing thread with no owning resource", () => {
    const result = evaluateCopilotKitAuth(request(), {
      userId: USER_A,
      thread: { kind: "existing", threadId: "t", resourceId: null },
    });
    expect(result).toMatchObject({ allowed: false, status: 401 });
  });
});

describe("assertCopilotKitAuthorized response", () => {
  it("returns null to continue for an authorized request", () => {
    expect(
      assertCopilotKitAuthorized(request(), {
        userId: USER_A,
        thread: { kind: "new", threadId: "t" },
      }),
    ).toBeNull();
  });

  it("maps a denial to the declared status", () => {
    const forbidden = assertCopilotKitAuthorized(request(), {
      userId: USER_A,
      thread: { kind: "existing", threadId: "t", resourceId: USER_B },
    });
    expect(forbidden?.status).toBe(403);

    const unauthenticated = assertCopilotKitAuthorized(request(), { userId: null });
    expect(unauthenticated?.status).toBe(401);
  });

  it("never leaks the configured key into the response body", async () => {
    vi.stubEnv("COPILOTKIT_API_KEY", KEY);
    const res = assertCopilotKitAuthorized(
      request({ headers: { authorization: "Bearer wrong" } }),
      { userId: null },
    );
    expect(res).not.toBeNull();
    const body = await res!.text();
    expect(body).not.toContain(KEY);
  });

  it("does not return the key for a same-origin unauthenticated request", async () => {
    vi.stubEnv("COPILOTKIT_API_KEY", KEY);
    const res = assertCopilotKitAuthorized(request({ headers: sameOrigin }), { userId: null });
    expect(res?.status).toBe(401);
    expect(await res!.text()).not.toContain(KEY);
  });
});
