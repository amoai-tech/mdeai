import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * Resolving which resource owns the thread a request names (SAN-1358 · D20).
 *
 * Why this is separate from the auth gate: the gate must stay pure and
 * synchronously testable, while this needs a database read. `mastra_threads`
 * has FORCED row-level security with a single `service_role` policy, so the
 * user-scoped client cannot read it at all — the lookup has to use the service
 * role client, the same one `/api/threads` already uses.
 *
 * The result is deliberately a discriminated union rather than a nullable
 * string. "No thread named", "thread does not exist yet" and "thread exists but
 * has no owner" must not collapse into the same value in an authorization path.
 */

/** The literal resource every unauthenticated caller used to share (D17). */
export const ANONYMOUS_RESOURCE_ID = "anonymous";

/**
 * The resource a validated service bearer owns (SAN-547 · D17).
 *
 * Before this existed, a service request reached the runtime with
 * `resourceId` defaulted to `"anonymous"`, so every service turn appended to
 * the shared bucket D20 exists to shut down — and the rows it created were
 * then unreachable, because the browser path rejects `anonymous`-owned
 * threads. A service principal now has its own named resource instead of
 * silently inheriting the legacy shared one.
 *
 * Deliberately not a user id: a service is a distinct principal, and naming it
 * keeps service-created conversations separable from every human's.
 */
export const SERVICE_RESOURCE_ID = "service:copilotkit";

export type RequestedThread =
  | { kind: "none" }
  | { kind: "new"; threadId: string }
  | { kind: "existing"; threadId: string; resourceId: string | null };

/**
 * Pull `threadId` out of a CopilotKit request body.
 *
 * A **real** browser request nests the AG-UI run input under `body`:
 *
 *   {"method":"agent/connect","params":{"agentId":"conciergeAgent"},
 *    "body":{"threadId":"9c3cc549-…","runId":"…","tools":[…]}}
 *
 * Verified by capturing live production traffic, not inferred from the tests.
 * The previous version read only a top-level `threadId`, so **every real
 * request looked like "no thread named"** and the ownership gate allowed it for
 * any authenticated caller — the 403 branch was unreachable in production and
 * only ever exercised by hand-built test bodies.
 *
 * The location **differs per method**, and authorization must agree with the
 * field the runtime actually acts on. `copilotRuntimeNextJSAppRouterEndpoint`
 * is backed by the v2 router, whose `fetch-handler.ts` reads:
 *
 *   agent/run | agent/connect → the AG-UI run input in `body`
 *   agent/stop                → `params.threadId`
 *
 * Preferring `body` unconditionally therefore let a request authorize an owned
 * `body.threadId` while `agent/stop` halting whatever `params.threadId` named —
 * someone else's active thread. Known methods try the runtime's own field first.
 *
 * Every list keeps the remaining locations as fallbacks, because returning
 * `null` here is **fail-open**: `null` reads as "no thread named", which the
 * gate allows. Under-reading is the bypass, so one extra candidate is always
 * cheaper than a missed check. First non-empty trimmed value wins.
 *
 * The **trimmed** value is returned, not the raw one. Returning the raw value
 * while validating the trimmed one would let a padded foreign thread ID
 * (`" victimThread"`) miss the ownership lookup, be read as "new thread" and
 * skip the 403 — and it would also send the handler to a different conversation
 * than the one that was authorized.
 */
export function extractThreadId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const nested = (key: string): unknown => {
    const container = record[key];
    if (!container || typeof container !== "object") return undefined;
    return (container as Record<string, unknown>).threadId;
  };

  const method = typeof record.method === "string" ? record.method : "";
  const candidates =
    method === "agent/stop"
      ? // `agent/stop` ignores body.threadId entirely and stops params.threadId.
        [nested("params"), nested("body"), record.threadId]
      : method === "agent/run" || method === "agent/connect"
        ? [nested("body"), nested("params"), record.threadId]
        : // Unknown method: keep the liberal order rather than guess a field.
          [nested("body"), record.threadId, nested("params")];

  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

/**
 * Read the thread ID without consuming the body the CopilotKit handler still
 * needs: `clone()` gives us an independent stream. Only JSON POSTs carry one.
 */
export async function readRequestedThreadId(req: NextRequest): Promise<string | null> {
  if (req.method !== "POST") return null;
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return null;
  try {
    return extractThreadId(await req.clone().json());
  } catch {
    // A body we cannot parse names no thread; the handler will reject it.
    return null;
  }
}

/**
 * Resolve the owner of the thread this request names.
 *
 * Fails **closed**: if the request names a thread but ownership cannot be
 * verified, this throws so the route returns a server error rather than letting
 * an unverified durable operation through.
 */
export async function resolveRequestedThread(req: NextRequest): Promise<RequestedThread> {
  const threadId = await readRequestedThreadId(req);
  if (!threadId) return { kind: "none" };

  const service = createServiceRoleClient();
  if (!service) {
    throw new Error("cannot verify thread ownership: service role client unavailable");
  }

  const { data, error } = await service
    .from("mastra_threads")
    .select('id, "resourceId"')
    .eq("id", threadId)
    .maybeSingle();

  if (error) {
    throw new Error(`cannot verify thread ownership: ${error.message}`);
  }
  if (!data) return { kind: "new", threadId };

  const resourceId = (data as { resourceId: unknown }).resourceId;
  return {
    kind: "existing",
    threadId,
    resourceId: typeof resourceId === "string" && resourceId.length > 0 ? resourceId : null,
  };
}
