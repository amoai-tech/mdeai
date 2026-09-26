import type { NextRequest } from "next/server";
import { ANONYMOUS_RESOURCE_ID, type RequestedThread } from "@/lib/copilotkit-thread-ownership";

/**
 * CopilotKit runtime authorization (SAN-1358 · D20).
 *
 * Two distinct trust paths, and **session/resource ownership is the
 * authorization decision** — a service bearer is only service-to-service
 * *authentication*:
 *
 *   service bearer  → validate it, then allow
 *   browser / app   → identity comes from the server, then thread ownership decides
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

export type CopilotKitAuthResult =
  | { allowed: true; via: "service-bearer" | "thread-owner" | "new-thread" }
  | { allowed: false; status: 401 | 403; reason: string };

/**
 * Decide whether a CopilotKit request may proceed.
 * Pure and synchronous so every branch is directly testable.
 */
export function evaluateCopilotKitAuth(
  req: NextRequest,
  context: CopilotKitAuthContext,
): CopilotKitAuthResult {
  // ---- Trusted service path -------------------------------------------------
  // A caller that presents a bearer is claiming to be a service. Validate that
  // claim or reject it; never fall through to the browser path, which would let
  // any junk Authorization header bypass the ownership check below.
  const authHeader = req.headers.get("authorization");
  if (authHeader !== null) {
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
    return { allowed: true, via: "service-bearer" };
  }

  // ---- Browser / app path ---------------------------------------------------
  // Identity must be server-derived. An unauthenticated caller has no resource
  // boundary to authorize against, so it cannot reach the runtime.
  if (!context.userId) {
    return { allowed: false, status: 401, reason: "no authenticated session" };
  }

  const thread = context.thread ?? { kind: "none" };

  // No durable thread named, or one that does not exist yet: the authenticated
  // caller may create it under their own resource id.
  if (thread.kind !== "existing") {
    return { allowed: true, via: "new-thread" };
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

  if (thread.resourceId !== context.userId) {
    return { allowed: false, status: 403, reason: "thread belongs to another resource" };
  }

  return { allowed: true, via: "thread-owner" };
}

/**
 * Route-facing wrapper returning the response to short-circuit with, or null to
 * continue. The body never echoes the configured key or any header value.
 */
export function assertCopilotKitAuthorized(
  req: NextRequest,
  context: CopilotKitAuthContext,
): Response | null {
  const result = evaluateCopilotKitAuth(req, context);
  if (result.allowed) return null;
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: result.status,
    headers: { "content-type": "application/json" },
  });
}
