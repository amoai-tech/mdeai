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

export type RequestedThread =
  | { kind: "none" }
  | { kind: "new"; threadId: string }
  | { kind: "existing"; threadId: string; resourceId: string | null };

/**
 * Pull `threadId` out of a CopilotKit request body.
 * The V1 protocol carries the AG-UI run input, whose `threadId` names the
 * conversation. Anything else (no body, non-JSON, wrong shape) yields null.
 *
 * The **trimmed** value is returned, not the raw one. Returning the raw value
 * while validating the trimmed one would let a padded foreign thread ID
 * (`" victimThread"`) miss the ownership lookup, be read as "new thread" and
 * skip the 403 — and it would also send the handler to a different conversation
 * than the one that was authorized.
 */
export function extractThreadId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).threadId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
