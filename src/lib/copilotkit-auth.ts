import type { NextRequest } from "next/server";
import {
  ANONYMOUS_RESOURCE_ID,
  SERVICE_RESOURCE_ID,
  type RequestedThread,
} from "@/lib/copilotkit-thread-ownership";

/**
 * CopilotKit runtime authorization (SAN-1358 · D20, tightened by SAN-547 · D17).
 *
 * There are two trust paths, and **resource ownership is the authorization
 * decision on both of them**. A service bearer proves *who is calling*
 * (authentication); it is not a licence to open someone else's conversation:
 *
 *   service bearer  → validate it, owner is `service:copilotkit`
 *   browser / app   → owner is the server-derived Supabase user id
 *
 * Both paths then run the **same** ownership rule, in one place. Keeping the
 * rule single is the point: when the service branch returned early, a valid
 * bearer skipped ownership entirely, so it could resume a real user's durable
 * thread and every service turn was persisted under the shared `anonymous`
 * resource.
 *
 * What this file deliberately does **not** do:
 *
 *   - It never treats same-origin as trust. `Origin`/`Referer` are routing
 *     context; the previous `isSameOriginBrowserRequest` fallback compared the
 *     `Origin` host to the `Host` header, and both are attacker-supplied, so
 *     `curl -H 'Origin: https://www.mdeai.co' -H 'Host: www.mdeai.co'` passed.
 *   - It never falls open when configuration is absent. A missing
 *     `COPILOTKIT_API_KEY` closes the service path instead of opening the route.
 *   - It never accepts the shared `anonymous` resource as an owner (D17).
 *
 * Every branch fails closed. There is no `return null` catch-all.
 */

export type CopilotKitAuthContext = {
  /** Supabase user id from a server-side `auth.getUser()`, or null when unauthenticated. */
  userId: string | null;
  /** The thread this request names, as resolved from the database. */
  thread?: RequestedThread;
};

/** How an allowed request proved who it is. */
export type CopilotKitTrustPath = "service-bearer" | "thread-owner" | "new-thread";

export type CopilotKitAuthResult =
  | {
      allowed: true;
      via: CopilotKitTrustPath;
      /**
       * The resource id the runtime must persist this turn under. Always
       * server-derived — never read from the request body — so a caller cannot
       * nominate its own durable identity (D17).
       */
      resourceId: string;
    }
  | { allowed: false; status: 401 | 403; reason: string };

/**
 * Decide whether a CopilotKit request may proceed.
 * Pure and synchronous so every branch is directly testable.
 */
export function evaluateCopilotKitAuth(
  req: NextRequest,
  context: CopilotKitAuthContext,
): CopilotKitAuthResult {
  const authHeader = req.headers.get("authorization");

  let ownerResourceId: string;
  let via: CopilotKitTrustPath;

  if (authHeader !== null) {
    // A caller that presents a bearer is claiming to be a service. Validate that
    // claim or reject it; never fall through to the browser path, which would
    // let any junk Authorization header bypass the ownership check below.
    const expectedKey = (process.env.COPILOTKIT_API_KEY ?? "").trim();
    if (!expectedKey) {
      return {
        allowed: false,
        status: 401,
        reason: "service bearer presented but COPILOTKIT_API_KEY is not configured",
      };
    }
    if (authHeader !== `Bearer ${expectedKey}`) {
      return { allowed: false, status: 401, reason: "invalid service bearer" };
    }
    // The service proves *who it is* here. What it may touch is still decided
    // by the ownership rule below — a valid bearer is not cross-user authority.
    ownerResourceId = SERVICE_RESOURCE_ID;
    via = "service-bearer";
  } else {
    // Identity must be server-derived. An unauthenticated caller has no resource
    // boundary to authorize against, so it cannot reach the runtime.
    if (!context.userId) {
      return { allowed: false, status: 401, reason: "no authenticated session" };
    }
    ownerResourceId = context.userId;
    via = "new-thread";
  }

  // ---- Ownership: one rule, both trust paths (D17) --------------------------
  const thread = context.thread ?? { kind: "none" };

  // No durable thread named, or one that does not exist yet: the caller may
  // create it under its own server-derived resource id.
  if (thread.kind !== "existing") {
    return { allowed: true, via, resourceId: ownerResourceId };
  }

  // D17: the shared anonymous bucket is never an ownership credential.
  if (thread.resourceId === ANONYMOUS_RESOURCE_ID) {
    return {
      allowed: false,
      status: 401,
      reason: "thread is owned by the shared anonymous resource",
    };
  }

  // A thread with no owner cannot be proven to belong to this caller.
  if (thread.resourceId === null) {
    return { allowed: false, status: 401, reason: "thread has no owning resource" };
  }

  if (thread.resourceId !== ownerResourceId) {
    return { allowed: false, status: 403, reason: "thread belongs to another resource" };
  }

  return { allowed: true, via: "thread-owner", resourceId: ownerResourceId };
}

export type CopilotKitAuthorization =
  | { allowed: true; resourceId: string; via: CopilotKitTrustPath }
  | { allowed: false; response: Response };

/**
 * Route-facing wrapper: either the server-derived resource the runtime must use,
 * or the response to short-circuit with. The body never echoes the configured
 * key or any header value.
 *
 * The resource id is returned rather than recomputed by the route so that the
 * identity the gate authorized is exactly the identity the runtime persists
 * under — two independent derivations could drift apart.
 */
export function authorizeCopilotKitRequest(
  req: NextRequest,
  context: CopilotKitAuthContext,
): CopilotKitAuthorization {
  const result = evaluateCopilotKitAuth(req, context);
  if (result.allowed) {
    return { allowed: true, resourceId: result.resourceId, via: result.via };
  }
  return {
    allowed: false,
    response: new Response(JSON.stringify({ error: "unauthorized" }), {
      status: result.status,
      headers: { "content-type": "application/json" },
    }),
  };
}
