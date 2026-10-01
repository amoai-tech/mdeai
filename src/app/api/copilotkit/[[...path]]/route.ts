import { CopilotRuntime, createCopilotRuntimeHandler } from "@copilotkit/runtime/v2";
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
  });
}

/**
 * Deterministic browser tests mock the domain, so runtime discovery is answered
 * locally instead of reaching auth. Never in production, never without the flag.
 *
 * Both discovery shapes count: the legacy `GET …/info`, and the single-route
 * envelope `POST /api/copilotkit {"method":"info"}` that the v2 client actually
 * sends. Only the GET shape used to match, so deterministic runs hit the real
 * auth gate and logged 401s (SAN-1378). The body is read from a clone, so a
 * non-info request still reaches the handler intact.
 */
async function isDeterministicE2ERuntimeInfoRequest(req: NextRequest): Promise<boolean> {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT !== "1"
  ) {
    return false;
  }
  const { pathname } = new URL(req.url);
  if (req.method === "GET") return pathname.endsWith("/api/copilotkit/info");
  if (req.method !== "POST") return false;
  try {
    const envelope = (await req.clone().json()) as { method?: unknown } | null;
    return envelope?.method === "info";
  } catch {
    return false;
  }
}

/** Auth, distributed rate limits, then CopilotKit/Mastra runtime. */
async function handleCopilotKit(req: NextRequest) {
  if (await isDeterministicE2ERuntimeInfoRequest(req)) {
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
