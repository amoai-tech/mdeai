/**
 * vote-cast handler (restaurant-only).
 *
 * Pure request logic with injected dependencies so the HTTP contract can be tested without
 * a server, a database or the network. index.ts wires the real production dependencies.
 *
 * Fail-closed: Turnstile/nonce misconfiguration or outage is a 503, never a silent pass.
 * Analytics is best-effort and can never turn a committed ballot into an error response.
 */
import { z } from "npm:zod@3.23.8";
import { getCorsHeaders, jsonResponse, errorBody } from "../_shared/http.ts";
import { clientIp } from "../_shared/rate-limit.ts";

export interface RpcError { code?: string; message?: string }
export interface RpcResult { data: unknown; error: RpcError | null }
export interface ServiceLike {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
  from(table: string): { insert(row: Record<string, unknown>): PromiseLike<{ error: unknown }> };
}
export type TurnstileOutcome = "ok" | "invalid" | "unavailable" | "misconfigured";
export interface NonceResult { valid: boolean; payload?: { jti: string }; reason?: string }
export interface RateResult { allowed: boolean; retry_after_seconds: number }

export interface VoteCastDeps {
  service: ServiceLike;
  verifyTurnstile: (token: string | undefined, ip: string) => Promise<TurnstileOutcome>;
  verifyNonce: (token: string | undefined, contestId?: string) => Promise<NonceResult>;
  getUserId: (authHeader: string) => Promise<string | null>;
  allowRate: (key: string, max: number, windowSeconds: number) => Promise<RateResult>;
}

const BodySchema = z.object({
  contest_id:      z.string().uuid(),
  entity_id:       z.string().uuid(),
  nonce:           z.string().optional(),
  turnstile_token: z.string().optional(),
  fingerprint:     z.string().max(128).optional(),
  idempotency_key: z.string().uuid(),
});
type Body = z.infer<typeof BodySchema>;

function ok(data: Record<string, unknown>, req: Request) {
  return jsonResponse({ success: true, data }, 200, req);
}
function err(status: number, code: string, message: string, req: Request) {
  return jsonResponse(errorBody(code, message), status, req);
}

/** Stable, sanitized mapping of RPC error messages to HTTP responses. */
function rpcError(error: RpcError, req: Request) {
  const msg = error.message ?? "";
  const map: Array<[string, number, string]> = [
    ["AUTH_REQUIRED", 401, "AUTH_REQUIRED"],
    ["AUTH_USER_NOT_FOUND", 401, "AUTH_REQUIRED"],
    ["CONTEST_NOT_FOUND", 404, "CONTEST_NOT_FOUND"],
    ["RESTAURANT_NOT_FOUND", 404, "RESTAURANT_NOT_FOUND"],
    ["CONTEST_CLOSED", 410, "CONTEST_CLOSED"],
    ["CONTEST_NOT_OPEN", 410, "CONTEST_CLOSED"],
    ["CONTEST_NOT_STARTED", 410, "CONTEST_NOT_STARTED"],
    ["CONTEST_NOT_RESTAURANT", 409, "NOT_A_RESTAURANT_CONTEST"],
    ["RESTAURANT_NOT_APPROVED", 409, "RESTAURANT_NOT_APPROVED"],
    ["IDEMPOTENCY_KEY_CONFLICT", 409, "BALLOT_CONFLICT"],
    ["INVALID_IDEMPOTENCY_KEY", 400, "INVALID_BALLOT"],
    ["INVALID_IP_HASH", 400, "INVALID_BALLOT"],
  ];
  for (const [needle, status, code] of map) {
    if (msg.includes(needle)) return err(status, code, msg, req);
  }
  if (error.code === "42501") return err(401, "AUTH_REQUIRED", "Sign in to vote", req);
  if (error.code === "23505") return err(409, "BALLOT_CONFLICT", "Vote already recorded", req);
  console.error("vote RPC error:", error);
  return err(500, "VOTE_FAILED", "Failed to record vote", req);
}

function rateLimited(retryAfterSeconds: number, req: Request) {
  const cors = getCorsHeaders(req);
  return new Response(JSON.stringify(errorBody("RATE_LIMITED", "Too many votes")), {
    status: 429,
    headers: { ...cors, "Retry-After": String(retryAfterSeconds), "Content-Type": "application/json" },
  });
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Daily salt rotates at UTC midnight — privacy-preserving IP fingerprint. */
function dailySalt(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createVoteCastHandler(deps: VoteCastDeps) {
  return async function handler(req: Request): Promise<Response> {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: cors });
    if (req.method !== "POST") return jsonResponse(errorBody("METHOD_NOT_ALLOWED", "POST only"), 405, req);

    const t0 = Date.now();
    const ip = clientIp(req);
    const country = req.headers.get("cf-ipcountry") ?? "XX";
    const userAgent = req.headers.get("user-agent")?.slice(0, 256) ?? null;
    const authHeader = req.headers.get("authorization") ?? "";

    let body: Body;
    try {
      body = BodySchema.parse(await req.json());
    } catch (e) {
      return err(400, "INVALID_BODY", e instanceof Error ? e.message : "bad request", req);
    }
    const { contest_id, entity_id, nonce, turnstile_token, fingerprint, idempotency_key } = body;

    const turnstile = await deps.verifyTurnstile(turnstile_token, ip);
    if (turnstile === "misconfigured") return err(503, "TURNSTILE_UNAVAILABLE", "Bot protection is not configured", req);
    if (turnstile === "unavailable") return err(503, "TURNSTILE_UNAVAILABLE", "Bot protection is temporarily unavailable", req);
    if (turnstile !== "ok") return err(403, "TURNSTILE_FAILED", "Bot challenge failed", req);

    const nonceResult = await deps.verifyNonce(nonce, contest_id);
    if (!nonceResult.valid) {
      if (nonceResult.reason === "nonce_not_configured") return err(503, "NONCE_UNAVAILABLE", "Vote protection is not configured", req);
      return err(403, "NONCE_INVALID", nonceResult.reason ?? "invalid nonce", req);
    }

    const rlIp = await deps.allowRate("vote-cast-ip:" + ip, 10, 60);
    if (!rlIp.allowed) return rateLimited(rlIp.retry_after_seconds, req);

    const userId = authHeader ? await deps.getUserId(authHeader) : null;
    if (!userId) return err(401, "AUTH_REQUIRED", "Sign in to vote", req);

    const rlUser = await deps.allowRate("vote-cast-user:" + userId, 20, 60);
    if (!rlUser.allowed) return rateLimited(rlUser.retry_after_seconds, req);

    // Single-use nonce; an already-committed retry recovers its original receipt.
    const consumed = await deps.service.rpc("vote_consume_nonce", { p_jti: nonceResult.payload?.jti ?? null });
    if (consumed.error) {
      console.error("vote_consume_nonce error:", consumed.error);
      return err(500, "VOTE_FAILED", "Failed to verify vote link", req);
    }
    if (consumed.data !== true) {
      const existing = await deps.service.rpc("vote_receipt", {
        p_contest_id: contest_id, p_user_id: userId, p_idempotency_key: idempotency_key,
      });
      if (!existing.error && existing.data) return ok(existing.data as Record<string, unknown>, req);
      return err(409, "NONCE_REPLAYED", "This vote link was already used. Refresh the page for a new one.", req);
    }

    const ctx = await deps.service.rpc("vote_contest_context", { p_contest_id: contest_id });
    if (ctx.error) {
      console.error("vote_contest_context error:", ctx.error);
      return err(500, "VOTE_FAILED", "Failed to load contest", req);
    }
    const context = ctx.data as { kind?: string; is_open?: boolean; voting_available?: boolean } | null;
    if (!context) return err(404, "CONTEST_NOT_FOUND", "Contest not found", req);
    if (context.kind !== "restaurant") return err(409, "NOT_A_RESTAURANT_CONTEST", "Not a restaurant contest", req);
    // The database decides whether voting is available for this phase; launch keeps the gates.
    const votingAvailable = context.voting_available ?? context.is_open ?? false;
    if (!votingAvailable) return err(410, "CONTEST_CLOSED", "This contest is not accepting votes", req);

    const ipHash = await sha256(ip + ":" + dailySalt());
    const cast = await deps.service.rpc("cast_restaurant_vote", {
      p_contest_id: contest_id,
      p_entity_id: entity_id,
      p_user_id: userId,
      p_idempotency_key: idempotency_key,
      p_ip_hash: ipHash,
      p_device_hash: fingerprint ?? null,
      p_user_agent: userAgent,
      p_country: country,
    });
    if (cast.error) return rpcError(cast.error, req);
    const receipt = cast.data as Record<string, unknown>;

    const tallyRes = await deps.service.rpc("vote_tally", { p_entity_id: entity_id });
    const tally = tallyRes.error ? null : tallyRes.data ?? null;

    const duration = Date.now() - t0;
    const logRes = await deps.service.from("ai_runs").insert({
      user_id: userId,
      agent_name: "vote-cast",
      agent_type: "general_concierge",
      input_data: { contest_id, entity_id },
      input_tokens: 0,
      output_tokens: 0,
      duration_ms: duration,
      status: "success",
      metadata: { contest_id, entity_id, status: receipt.status, duration_ms: duration },
    });
    if (logRes.error) console.error("vote-cast analytics failed (vote already committed)", logRes.error);

    return ok({ ...receipt, tally }, req);
  };
}
