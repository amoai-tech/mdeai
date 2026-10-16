/**
 * Short-lived nonce JWT for vote-cast protection.
 *
 * Always signed and bound to BOTH the contest and the authenticated user (sub).
 * There is NO unsigned fallback: if VOTE_NONCE_SECRET is missing, issueNonce throws
 * and verifyNonce fails closed. Tests must inject a fake verifyNonce rather than
 * rely on an unsigned token.
 */

const ALG = "HS256";
const TTL_SECONDS = 90; // 60s + 30s clock skew

function base64url(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface NoncePayload {
  contest_id: string;
  sub: string; // authenticated user id the nonce was issued to
  iat: number;
  exp: number;
  jti: string; // unique per nonce — for replay detection
}

/** Issue a signed nonce JWT bound to a contest and a user. Requires VOTE_NONCE_SECRET. */
export async function issueNonce(contestId: string, userId: string): Promise<string> {
  if (!contestId || !userId) throw new Error("issueNonce requires a contest id and a user id");
  const secret = Deno.env.get("VOTE_NONCE_SECRET");
  if (!secret) throw new Error("VOTE_NONCE_SECRET is not configured");

  const now = Math.floor(Date.now() / 1000);
  const payload: NoncePayload = {
    contest_id: contestId,
    sub: userId,
    iat: now,
    exp: now + TTL_SECONDS,
    jti: crypto.randomUUID(),
  };
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: ALG, typ: "JWT" })));
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsigned = header + "." + body;

  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return unsigned + "." + base64url(sig);
}

export interface NonceVerifyResult {
  valid: boolean;
  payload?: NoncePayload;
  reason?: string;
}

/**
 * Verify a signed nonce token. Fails closed: no secret -> nonce_not_configured,
 * no token -> missing_nonce, unsigned token -> unsigned_nonce.
 * When expected values are supplied, the contest and the user must match.
 */
export async function verifyNonce(
  token: string | undefined,
  expectedContestId?: string,
  expectedUserId?: string,
): Promise<NonceVerifyResult> {
  const secret = Deno.env.get("VOTE_NONCE_SECRET");
  if (!secret) return { valid: false, reason: "nonce_not_configured" };
  if (!token) return { valid: false, reason: "missing_nonce" };

  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed_nonce" };
  const [header, body, sig] = parts;
  if (sig === "unsigned") return { valid: false, reason: "unsigned_nonce" };

  try {
    const unsigned = header + "." + body;
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlDecode(sig).buffer as ArrayBuffer,
      new TextEncoder().encode(unsigned).buffer as ArrayBuffer,
    );
    if (!ok) return { valid: false, reason: "invalid_signature" };

    const payload: NoncePayload = JSON.parse(
      new TextDecoder().decode(base64urlDecode(body)),
    );
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) return { valid: false, reason: "nonce_expired" };
    if (expectedContestId && payload.contest_id !== expectedContestId) return { valid: false, reason: "contest_mismatch" };
    if (!payload.sub) return { valid: false, reason: "missing_subject" };
    if (expectedUserId && payload.sub !== expectedUserId) return { valid: false, reason: "user_mismatch" };
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: "verify_error" };
  }
}
