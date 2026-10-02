import { CopilotRuntime, createCopilotRuntimeHandler, type RouteInfo } from "@copilotkit/runtime/v2";
import { MASTRA_RESOURCE_ID_KEY, RequestContext } from "@mastra/core/request-context";
import { NextRequest, after } from "next/server";
import { authorizeCopilotKitRequest } from "@/lib/copilotkit-auth";
import { resolveRequestedThread } from "@/lib/copilotkit-thread-ownership";
import {
  checkCopilotKitDistributedIpHardCeiling,
  checkCopilotKitDistributedRateLimit,
} from "@/lib/copilotkit-distributed-rate-limit";
import { COPILOTKIT_BASE_PATH, COPILOTKIT_HANDLER_MODE } from "@/lib/copilotkit-transport";
import { createClient } from "@/lib/supabase/server";
import { mastra } from "@/mastra";
import { getLocalAgentsWithLogging } from "@/mastra/copilotkit/logging-mastra-agent";
import { setAuditUserId } from "@/mastra/lib/tool-audit-context";
import { HOST_SUPABASE_KEY } from "@/mastra/tools/hostops-read-tools";
import { logAgentRunForTurn } from "@/mastra/lib/log-agent-run";
import type { PersistTurnLog } from "@/mastra/copilotkit/logging-mastra-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Keep ai_runs writes alive after the CopilotKit SSE response (Vercel serverless). */
const persistTurnLog: PersistTurnLog = (opts) => {
  after(async () => {
    try {
      await logAgentRunForTurn(opts);
    } catch (error) {
      const meta = opts.metadata ?? {};
      console.error("[copilotkit ai_runs persist failed]", {
        agentMapKey: opts.agentMapKey,
        status: opts.status,
        threadId:
          (typeof meta.thread_id === "string" ? meta.thread_id : null) ??
          (typeof meta.threadId === "string" ? meta.threadId : null),
        runId:
          (typeof meta.run_id === "string" ? meta.run_id : null) ??
          (typeof meta.runId === "string" ? meta.runId : null),
        error,
      });
    }
  });
};

/**
 * The runtime operations MDE's own client uses. Everything else is refused
 * with 403 after CopilotKit has routed the request (`onBeforeHandler`), before
 * any handler or runner sees it. An allowlist, so a route added by a future
 * CopilotKit version is closed until someone opens it deliberately.
 *
 * Why `threads/*` is NOT here (SAN-1358 · D20): the default in-memory runner
 * keeps every thread of the process in one owner-less map, and its thread
 * routes answer for any id: list every thread, read any thread's messages,
 * events or state, rename or delete it, or clear them all. In single-route
 * mode those arrive as `resource/request` with the thread id inside
 * `params.path`, which the body-based ownership gate above never sees, so a
 * signed-in user could read and wipe another user's live conversation. MDE
 * lists threads through its own owner-scoped `/api/threads` instead.
 *
 * ponytail: deny-all for thread routes is the ceiling while nothing in MDE
 * needs them. Upgrade path: when visible chat history lands, allow
 * `threads/messages` only after checking `route.threadId` against
 * `mastra_threads.resourceId` for this request's resource.
 *
 * `agent/stop` carries its thread in `params.threadId`, which the ownership
 * gate does read (see `extractThreadId`), so it stays allowed.
 *
 * `agent/suggest` and `transcribe` are closed too: in 1.75.0 the client sends
 * `/suggest` only in multi-route mode (`core/src/core/suggestion-engine.ts`),
 * and the chat shows its microphone only when the runtime has a transcription
 * service, which MDE does not configure.
 */
const ALLOWED_RUNTIME_ROUTES = new Set<RouteInfo["method"]>([
  "info",
  "agent/run",
  "agent/connect",
  "agent/stop",
]);

function refuseUnlistedRuntimeRoutes({ route }: { route: RouteInfo }): void {
  if (!ALLOWED_RUNTIME_ROUTES.has(route.method)) {
    throw Response.json({ error: "forbidden" }, { status: 403 });
  }
}

/** Build per-request CopilotKit handler with Mastra agents and audit logging. */
function buildHandler(options: {
  /** Server-derived durable owner. Required: there is no shared fallback (D17). */
  resourceId: string;
  userId: string | null;
  requestContext: RequestContext;
}) {
  const { resourceId } = options;
  const runtime = new CopilotRuntime({
    agents: getLocalAgentsWithLogging({
      mastra,
      resourceId,
      userId: options.userId,
      requestContext: options.requestContext,
      persistTurnLog,
    }),
  });

  // v2 fetch handler. `basePath` and `mode` are written explicitly rather than
  // left to defaults: `mode` defaults to "multi-route", which would silently
  // disagree with the client's pinned `useSingleEndpoint: true`. The failure is
  // nasty — the run route 404s while `GET /info` still returns 200, so the app
  // looks connected. Both halves come from `@/lib/copilotkit-transport`, where a
  // change to either fails typecheck instead of production.
  //
  // No custom runner is set, so the runtime's default (in-memory, `runId`-aware)
  // runner is used. `@copilotkit/sqlite-runner` ignores `runId`, which would
  // silently widen a run-scoped Stop to the whole thread.
  return createCopilotRuntimeHandler({
    runtime,
    basePath: COPILOTKIT_BASE_PATH,
    mode: COPILOTKIT_HANDLER_MODE,
    hooks: { onBeforeHandler: refuseUnlistedRuntimeRoutes },
  });
}

function isDeterministicE2ERuntimeInfoRequest(req: NextRequest) {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT === "1" &&
    req.method === "GET" &&
    new URL(req.url).pathname.endsWith("/api/copilotkit/info")
  );
}

/** Auth, distributed rate limits, then CopilotKit/Mastra runtime. */
async function handleCopilotKit(req: NextRequest) {
  if (isDeterministicE2ERuntimeInfoRequest(req)) {
    return Response.json({ agents: {} });
  }

  try {
    // 1. IP hard ceiling first — it has no secret or user dependency, so it can
    //    shed abusive traffic before we spend a Supabase round-trip on it.
    const ipHardCeiling = await checkCopilotKitDistributedIpHardCeiling(req);
    if (ipHardCeiling) return ipHardCeiling;

    // 2. Server-derived identity. Origin/Referer is routing context, never proof.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const userId = user?.id ?? null;

    // 3. Authorization + thread ownership, BEFORE any CopilotKit/AG-UI handling.
    //    AG-UI loads and rewrites thread metadata before downstream memory
    //    validation, so a foreign thread must be rejected here, not later.
    //    The gate also returns the *only* resource id this turn may persist
    //    under, so identity is derived once and never re-guessed downstream.
    //
    //    The gate reads the request body, so it MUST clone before inspecting —
    //    a consumed body reaches the runtime empty, and an empty stop body is a
    //    thread-wide stop, which is exactly the escalation this ordering exists
    //    to prevent. See Step 11's STOP-4 assertions.
    const thread = await resolveRequestedThread(req);
    const auth = authorizeCopilotKitRequest(req, { userId, thread });
    if (!auth.allowed) return auth.response;
    const { resourceId } = auth;

    const rateLimited = await checkCopilotKitDistributedRateLimit(req, userId);
    if (rateLimited) return rateLimited;

    const requestContext = new RequestContext();
    // D17: every allowed runtime request carries a server-derived owner. Mastra
    // prefers this key over any client-supplied resource, and the AG-UI adapter
    // falls back to the client's `threadId` when no resource is set — so leaving
    // it unset here is what let a service turn write into the shared bucket.
    requestContext.set(MASTRA_RESOURCE_ID_KEY, resourceId);
    if (userId) {
      setAuditUserId(requestContext, userId);
      // SAN-760 · AIE-005 — hostOpsAgent + HostDashboardState — hand the agent's
      // tools the SAME user-scoped client (RLS-governed; never service-role).
      // Deliberately user-only: a service principal must never receive a
      // user-scoped rental client through agent tools.
      // getHostContext reads it back.
      requestContext.set(HOST_SUPABASE_KEY, supabase);
    }

    return await buildHandler({ resourceId, userId, requestContext })(req);
  } catch (error) {
    console.error("[copilotkit route failed]", error);
    return new Response("CopilotKit route failed", { status: 500 });
  }
}

/** Catch-all so GET /api/copilotkit/info and POST /api/copilotkit both reach the handler. */
export const GET = handleCopilotKit;
export const POST = handleCopilotKit;
