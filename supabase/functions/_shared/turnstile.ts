/** Cloudflare Turnstile server-side token verification. */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileOutcome = "ok" | "invalid" | "unavailable" | "misconfigured";

/**
 * Local dev/test may run without a Turnstile account. Everywhere else the check is
 * fail-closed: a missing secret is a misconfiguration, not an implicit pass.
 */
function isLocalDev(): boolean {
  const env = Deno.env.get("ENVIRONMENT");
  return env === "development" || env === "test";
}

/**
 * Verify a Turnstile widget token server-side. Fail-closed policy:
 *   - no secret configured  -> "misconfigured" (503) unless ENVIRONMENT is dev/test
 *   - network/HTTP failure  -> "unavailable"    (503), never a silent pass
 *   - token rejected        -> "invalid"        (403)
 */
export async function verifyTurnstile(
  token: string | undefined,
  remoteip?: string,
): Promise<TurnstileOutcome> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) {
    return isLocalDev() ? "ok" : "misconfigured";
  }
  if (!token) return "invalid";

  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set("remoteip", remoteip);

  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body });
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
