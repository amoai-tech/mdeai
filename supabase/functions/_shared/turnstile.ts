/** Cloudflare Turnstile server-side token verification. */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileOutcome = "ok" | "invalid" | "unavailable" | "misconfigured";

/**
 * Verify a Turnstile widget token server-side.
 *
 * This helper NEVER decides whether a request may skip bot protection — the caller decides
 * that from the server-controlled application phase. Whenever it IS called the check is
 * strictly fail-closed in EVERY environment, including development:
 *   - no secret configured  -> "misconfigured" (503)
 *   - network/HTTP failure  -> "unavailable"    (503), never a silent pass
 *   - token rejected        -> "invalid"        (403)
 */
export async function verifyTurnstile(
  token: string | undefined,
  remoteip?: string,
): Promise<TurnstileOutcome> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) {
    return "misconfigured";
  }
  if (!token) return "invalid";

  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set("remoteip", remoteip);

  try {
    // Bounded wait: a stalled Cloudflare request must reach the catch below quickly
    // and return "unavailable" (503) instead of hitting the function wall-clock limit.
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.error("Turnstile verify HTTP", res.status, "— failing closed");
      return "unavailable";
    }
    const data: { success?: boolean } = await res.json();
    return data.success === true ? "ok" : "invalid";
  } catch (e) {
    console.error("Turnstile verify network error — failing closed", e);
    return "unavailable";
  }
}
