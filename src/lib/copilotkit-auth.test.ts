import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { authorizeCopilotKitRequest, evaluateCopilotKitAuth } from "./copilotkit-auth";
import { ANONYMOUS_RESOURCE_ID, SERVICE_RESOURCE_ID } from "./copilotkit-thread-ownership";

/**
 * SAN-1358 · D20. The previous suite *asserted the vulnerability was correct*
 * ("allows any request when COPILOTKIT_API_KEY is unset" and "allows same-origin
 * browser POST in production without bearer"). Both are now inverted, and the
 * same-origin bypass is pinned as a regression.
 *
 * SAN-547 · D17. The service branch used to `return` before the ownership check,
 * so a valid bearer skipped it entirely. The service path now runs the *same*
 * rule as the browser path, and this suite pins that by running one matrix
 * across both trust paths.
 */

const KEY = "service-secret-value";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function request(
  init: {
    method?: string;
    headers?: Record<string, string>;
    url?: string;
  } = {},
): NextRequest {
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

/** The most common probe shape in this suite: a same-origin browser request. */
function sameOriginRequest(): NextRequest {
  return request({ headers: sameOrigin });
}

/** A request carrying the valid service credential. */
function serviceRequest(): NextRequest {
  return request({ headers: { authorization: `Bearer ${KEY}` } });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("service bearer path", () => {
  it("allows a matching bearer, owning a named resource rather than a shared one", () => {
    vi.stubEnv("COPILOTKIT_API_KEY", KEY);
    const result = evaluateCopilotKitAuth(serviceRequest(), { userId: null });
    expect(result).toEqual({
      allowed: true,
      via: "service-bearer",
      resourceId: SERVICE_RESOURCE_ID,
    });
  });

  // The D17 regression: this previously returned early and skipped ownership.
  it("never lets a valid bearer open a real user's thread (403, not allow)", () => {
    vi.stubEnv("COPILOTKIT_API_KEY", KEY);
    const result = evaluateCopilotKitAuth(serviceRequest(), {
      userId: null,
      thread: { kind: "existing", threadId: "t", resourceId: USER_A },
    });
    expect(result).toMatchObject({ allowed: false, status: 403 });
  });

  it("lets a valid bearer resume a thread the service itself owns", () => {
    vi.stubEnv("COPILOTKIT_API_KEY", KEY);
    const result = evaluateCopilotKitAuth(serviceRequest(), {
      userId: null,
      thread: { kind: "existing", threadId: "t", resourceId: SERVICE_RESOURCE_ID },
    });
    expect(result).toEqual({
      allowed: true,
      via: "thread-owner",
      resourceId: SERVICE_RESOURCE_ID,
    });
  });

  it("rejects a valid bearer naming a legacy anonymous thread (D17)", () => {
    vi.stubEnv("COPILOTKIT_API_KEY", KEY);
    const result = evaluateCopilotKitAuth(serviceRequest(), {
      userId: null,
      thread: { kind: "existing", threadId: "t", resourceId: ANONYMOUS_RESOURCE_ID },
    });
    expect(result).toMatchObject({ allowed: false, status: 401 });
  });

  it("rejects a valid bearer naming a thread with no owning resource", () => {
    vi.stubEnv("COPILOTKIT_API_KEY", KEY);
    const result = evaluateCopilotKitAuth(serviceRequest(), {
      userId: null,
      thread: { kind: "existing", threadId: "t", resourceId: null },
    });
    expect(result).toMatchObject({ allowed: false, status: 401 });
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

  it("never lets an unvalidatable bearer fall through to the browser path", () => {
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
    const result = evaluateCopilotKitAuth(sameOriginRequest(), { userId: null });
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
      evaluateCopilotKitAuth(sameOriginRequest(), {
        userId: USER_A,
        thread: { kind: "new", threadId: "fresh" },
      }),
    ).toEqual({ allowed: true, via: "new-thread", resourceId: USER_A });
  });

  it("allows an authenticated caller to use a thread they own", () => {
    expect(
      evaluateCopilotKitAuth(request(), {
        userId: USER_A,
        thread: { kind: "existing", threadId: "t", resourceId: USER_A },
      }),
    ).toEqual({ allowed: true, via: "thread-owner", resourceId: USER_A });
  });

  it("returns 403 for a thread owned by another user", () => {
    const result = evaluateCopilotKitAuth(sameOriginRequest(), {
      userId: USER_A,
      thread: { kind: "existing", threadId: "t", resourceId: USER_B },
    });
    expect(result).toMatchObject({ allowed: false, status: 403 });
  });

  it("rejects an existing thread on the shared anonymous resource (D17)", () => {
    const result = evaluateCopilotKitAuth(sameOriginRequest(), {
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

describe("identity is per-request, never shared or client-nominated", () => {
  it("gives two callers different resources for the same new thread id", () => {
    // The collision case from the task matrix. The decider holds no module-global
    // identity: whoever wins the insert owns the row, and the loser is then
    // rejected as a foreign owner (pinned in the browser suite above). What must
    // never happen is both callers being handed the *same* durable owner.
    const thread = { kind: "new" as const, threadId: "same-new-thread" };
    const a = evaluateCopilotKitAuth(request(), { userId: USER_A, thread });
    const b = evaluateCopilotKitAuth(request(), { userId: USER_B, thread });

    expect(a).toEqual({ allowed: true, via: "new-thread", resourceId: USER_A });
    expect(b).toEqual({ allowed: true, via: "new-thread", resourceId: USER_B });
    const aResource = a.allowed ? a.resourceId : null;
    const bResource = b.allowed ? b.resourceId : null;
    expect(aResource).not.toBe(bResource);
  });

  it("derives the resource from server identity, not from the request body", () => {
    // A body claiming someone else's resource cannot influence the owner.
    const owned = new NextRequest("https://www.mdeai.co/api/copilotkit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceId: USER_B, threadId: "t" }),
    });
    expect(
      evaluateCopilotKitAuth(owned, {
        userId: USER_A,
        thread: { kind: "existing", threadId: "t", resourceId: USER_B },
      }),
    ).toMatchObject({ allowed: false, status: 403 });
  });

  it("never assigns the shared anonymous resource to an allowed request", () => {
    vi.stubEnv("COPILOTKIT_API_KEY", KEY);
    const allowed = [
      evaluateCopilotKitAuth(request(), { userId: USER_A }),
      evaluateCopilotKitAuth(serviceRequest(), { userId: null }),
    ];
    for (const result of allowed) {
      expect(result.allowed).toBe(true);
      expect(result.allowed && result.resourceId).not.toBe(ANONYMOUS_RESOURCE_ID);
    }
  });
});

describe("authorizeCopilotKitRequest response", () => {
  it("returns the server-derived resource for an authorized request", () => {
    expect(
      authorizeCopilotKitRequest(request(), {
        userId: USER_A,
        thread: { kind: "new", threadId: "t" },
      }),
    ).toEqual({ allowed: true, resourceId: USER_A, via: "new-thread" });
  });

  it("maps a denial to the declared status", () => {
    const forbidden = authorizeCopilotKitRequest(request(), {
      userId: USER_A,
      thread: { kind: "existing", threadId: "t", resourceId: USER_B },
    });
    expect(forbidden.allowed).toBe(false);
    expect(forbidden.allowed === false && forbidden.response.status).toBe(403);

    const unauthenticated = authorizeCopilotKitRequest(request(), { userId: null });
    expect(unauthenticated.allowed === false && unauthenticated.response.status).toBe(401);
  });

  it("never leaks the configured key into the response body", async () => {
    vi.stubEnv("COPILOTKIT_API_KEY", KEY);
    const result = authorizeCopilotKitRequest(
      request({ headers: { authorization: "Bearer wrong" } }),
      { userId: null },
    );
    expect(result.allowed).toBe(false);
    const body = await (result.allowed === false ? result.response : new Response()).text();
    expect(body).not.toContain(KEY);
  });

  it("does not return the key for a same-origin unauthenticated request", async () => {
    vi.stubEnv("COPILOTKIT_API_KEY", KEY);
    const result = authorizeCopilotKitRequest(sameOriginRequest(), { userId: null });
    expect(result.allowed === false && result.response.status).toBe(401);
    const body = await (result.allowed === false ? result.response : new Response()).text();
    expect(body).not.toContain(KEY);
  });
});
