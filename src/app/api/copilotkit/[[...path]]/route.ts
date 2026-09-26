import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { MASTRA_RESOURCE_ID_KEY, RequestContext } from "@mastra/core/request-context";
import { NextRequest, after } from "next/server";
import { authorizeCopilotKitRequest } from "@/lib/copilotkit-auth";
import { resolveRequestedThread } from "@/lib/copilotkit-thread-ownership";
import {
  checkCopilotKitDistributedIpHardCeiling,
  checkCopilotKitDistributedRateLimit,
} from "@/lib/copilotkit-distributed-rate-limit";
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

const serviceAdapter = new ExperimentalEmptyAdapter();

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

  return copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  }).handleRequest;
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

/** Catch-all so GET /api/copilotkit/info and POST /api/copilotkit both reach the Hono handler. */
export const GET = handleCopilotKit;
export const POST = handleCopilotKit;
