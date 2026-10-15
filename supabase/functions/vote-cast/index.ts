/**
 * vote-cast — POST /vote-cast  (restaurant-only)
 *
 * SAN-1498: the restaurant People's Choice ballot writer. It never touches the private
 * vote schema directly; every read/write goes through a public SECURITY DEFINER RPC that
 * is granted to service_role only, so PostgREST never sees the private schema (PGRST106).
 *
 *   signed-in user -> verify Supabase JWT -> consume nonce -> cast_restaurant_vote -> receipt
 *
 * Fail-closed policy: Turnstile and nonce misconfiguration or outage returns 503, never a
 * silent pass. Analytics logging is best-effort and can never turn a committed vote into an
 * error response.
 */
import { z } from "npm:zod@3.23.8";
import { getCorsHeaders, jsonResponse, errorBody } from "../_shared/http.ts";
import { allowRateDurable, clientIp } from "../_shared/rate-limit.ts";
import { getServiceClient, getUserId } from "../_shared/supabase-clients.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { verifyNonce } from "../_shared/nonce.ts";

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

/** Stable, sanitized mapping of the RPC's Postgres error messages to HTTP responses. */
function rpcError(error: { code?: string; message?: string }, req: Request) {
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

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return jsonResponse(errorBody("METHOD_NOT_ALLOWED", "POST only"), 405, req);
  }

  const t0 = Date.now();
  const ip = clientIp(req);
  const country = req.headers.get("cf-ipcountry") ?? "XX";
  const userAgent = req.headers.get("user-agent")?.slice(0, 256) ?? null;
  const authHeader = req.headers.get("authorization") ?? "";
  const service = getServiceClient();

  let body: Body;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return err(400, "INVALID_BODY", e instanceof Error ? e.message : "bad request", req);
  }
  const { contest_id, entity_id, nonce, turnstile_token, fingerprint, idempotency_key } = body;

  // L1: Turnstile — fail closed on misconfiguration or outage.
  const turnstile = await verifyTurnstile(turnstile_token, ip);
  if (turnstile === "misconfigured") {
    return err(503, "TURNSTILE_UNAVAILABLE", "Bot protection is not configured", req);
  }
  if (turnstile === "unavailable") {
    return err(503, "TURNSTILE_UNAVAILABLE", "Bot protection is temporarily unavailable", req);
  }
  if (turnstile !== "ok") {
    return err(403, "TURNSTILE_FAILED", "Bot challenge failed", req);
  }

  // L2: server-issued nonce bound to the contest (signature + expiry).
  const nonceResult = await verifyNonce(nonce, contest_id);
  if (!nonceResult.valid) {
    if (nonceResult.reason === "nonce_not_configured") {
      return err(503, "NONCE_UNAVAILABLE", "Vote protection is not configured", req);
    }
    return err(403, "NONCE_INVALID", nonceResult.reason ?? "invalid nonce", req);
  }

  // L4a: durable per-IP rate limit (restored to the deployed 10/min).
  const rlIp = await allowRateDurable(service, "vote-cast-ip:" + ip, 10, 60);
  if (!rlIp.allowed) {
    return rateLimited(rlIp.retry_after_seconds, req);
  }

  // Restaurant ballots require a verified Supabase session. Identity comes from the JWT.
  const userId = authHeader ? await getUserId(authHeader) : null;
  if (!userId) {
    return err(401, "AUTH_REQUIRED", "Sign in to vote", req);
  }

  // L4b: durable per-account rate limit
  const rlUser = await allowRateDurable(service, "vote-cast-user:" + userId, 20, 60);
  if (!rlUser.allowed) {
    return rateLimited(rlUser.retry_after_seconds, req);
  }

  // L2 replay: consume the nonce exactly once before any write.
  const { data: consumed, error: nonceErr } = await service.rpc("vote_consume_nonce", {
    p_jti: nonceResult.payload?.jti ?? null,
  });
  if (nonceErr) {
    console.error("vote_consume_nonce error:", nonceErr);
    return err(500, "VOTE_FAILED", "Failed to verify vote link", req);
  }
  if (consumed !== true) {
    return err(409, "NONCE_REPLAYED", "This vote link was already used", req);
  }

  // Fail fast with a clear error; the writer re-checks atomically.
  const { data: context, error: ctxErr } = await service.rpc("vote_contest_context", { p_contest_id: contest_id });
  if (ctxErr) {
    console.error("vote_contest_context error:", ctxErr);
    return err(500, "VOTE_FAILED", "Failed to load contest", req);
  }
  if (!context) {
    return err(404, "CONTEST_NOT_FOUND", "Contest not found", req);
  }
  if (context.kind !== "restaurant") {
    return err(409, "NOT_A_RESTAURANT_CONTEST", "Not a restaurant contest", req);
  }
  if (!context.is_open) {
    return err(410, "CONTEST_CLOSED", "This contest is not accepting votes", req);
  }

  const ipHash = await sha256(ip + ":" + dailySalt());

  const { data: receipt, error } = await service.rpc("cast_restaurant_vote", {
    p_contest_id: contest_id,
    p_entity_id: entity_id,
    p_user_id: userId,
    p_idempotency_key: idempotency_key,
    p_ip_hash: ipHash,
    p_device_hash: fingerprint ?? null,
    p_user_agent: userAgent,
    p_country: country,
  });
  if (error) return rpcError(error, req);

  // Updated tally for the optimistic UI (never fails the committed vote).
  const { data: tally } = await service.rpc("vote_tally", { p_entity_id: entity_id });

  // Best-effort analytics: a logging failure must never hide a committed ballot.
  const duration = Date.now() - t0;
  const { error: logErr } = await service.from("ai_runs").insert({
    agent_name: "vote-cast",
    input_tokens: 0,
    output_tokens: 0,
    duration_ms: duration,
    status: "success",
    metadata: { contest_id, entity_id, status: (receipt as Record<string, unknown>)?.status, duration_ms: duration },
  });
  if (logErr) {
    console.error("vote-cast analytics failed (vote already committed)", logErr);
  }

  return ok({ ...(receipt as Record<string, unknown>), tally: tally ?? null }, req);
});

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
