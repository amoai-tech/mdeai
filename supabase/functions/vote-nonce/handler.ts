/**
 * vote-nonce handler — issues a short-lived, contest-bound nonce for a signed-in user.
 *
 * Dependency-injected so the HTTP contract is testable without a server or database.
 * The nonce is the anti-bot/replay ticket that vote-cast later verifies and consumes once.
 */
import { z } from "npm:zod@3.23.8";
import { getCorsHeaders, jsonResponse, errorBody } from "../_shared/http.ts";
import { clientIp } from "../_shared/rate-limit.ts";

export interface RpcError { code?: string; message?: string }
export interface RpcResult { data: unknown; error: RpcError | null }
export interface ServiceLike { rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult> }
export interface RateResult { allowed: boolean; retry_after_seconds: number }

export interface VoteNonceDeps {
  service: ServiceLike;
  getUserId: (authHeader: string) => Promise<string | null>;
  issueNonce: (contestId: string) => Promise<string>;
  allowRate: (key: string, max: number, windowSeconds: number) => Promise<RateResult>;
}

const BodySchema = z.object({ contest_id: z.string().uuid() });

function err(status: number, code: string, message: string, req: Request) {
  return jsonResponse(errorBody(code, message), status, req);
}
function rateLimited(retryAfterSeconds: number, req: Request) {
  const cors = getCorsHeaders(req);
  return new Response(JSON.stringify(errorBody("RATE_LIMITED", "Too many requests")), {
    status: 429,
    headers: { ...cors, "Retry-After": String(retryAfterSeconds), "Content-Type": "application/json" },
  });
}

export function createVoteNonceHandler(deps: VoteNonceDeps) {
  return async function handler(req: Request): Promise<Response> {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: cors });
    if (req.method !== "POST") return jsonResponse(errorBody("METHOD_NOT_ALLOWED", "POST only"), 405, req);

    const ip = clientIp(req);
    const authHeader = req.headers.get("authorization") ?? "";

    let body: { contest_id: string };
    try {
      body = BodySchema.parse(await req.json());
    } catch (e) {
      return err(400, "INVALID_BODY", e instanceof Error ? e.message : "bad request", req);
    }
    const contestId = body.contest_id;

    const rlIp = await deps.allowRate("vote-nonce-ip:" + ip, 30, 60);
    if (!rlIp.allowed) return rateLimited(rlIp.retry_after_seconds, req);

    const userId = authHeader ? await deps.getUserId(authHeader) : null;
    if (!userId) return err(401, "AUTH_REQUIRED", "Sign in to vote", req);

    const rlUser = await deps.allowRate("vote-nonce-user:" + userId, 30, 60);
    if (!rlUser.allowed) return rateLimited(rlUser.retry_after_seconds, req);

    const ctx = await deps.service.rpc("vote_contest_context", { p_contest_id: contestId });
    if (ctx.error) {
      console.error("vote_contest_context error:", ctx.error);
      return err(500, "VOTE_FAILED", "Failed to load contest", req);
    }
    const context = ctx.data as { kind?: string; voting_available?: boolean } | null;
    if (!context) return err(404, "CONTEST_NOT_FOUND", "Contest not found", req);
    if (context.kind !== "restaurant") return err(409, "NOT_A_RESTAURANT_CONTEST", "Not a restaurant contest", req);
    if (context.voting_available !== true) {
      return err(410, "CONTEST_CLOSED", "This contest is not accepting votes", req);
    }

    let nonce: string;
    try {
      nonce = await deps.issueNonce(contestId);
    } catch (e) {
      console.error("issueNonce failed (check VOTE_NONCE_SECRET):", e);
      return err(503, "NONCE_UNAVAILABLE", "Vote protection is temporarily unavailable", req);
    }

    return jsonResponse({ success: true, data: { nonce, expires_in_seconds: 90 } }, 200, req);
  };
}
