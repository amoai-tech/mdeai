/**
 * whatsapp-webhook — DENY BY DEFAULT (SAN-1443 containment).
 *
 * WHAT WAS WRONG
 * The deployed revision (v39) accepted any POST with `verify_jwt=false` and no provider
 * authenticity check, then used a service-role Supabase client, inserted rows, and called
 * paid Gemini/Anthropic and Infobip endpoints. The endpoint is reachable by anyone.
 *
 * WHAT THIS IS
 * A deny-by-default replacement. It performs no privileged work: no request-body parsing,
 * no environment read, no database client, no outbound fetch. Every request is answered 403.
 * The legacy logic is retired, not repaired, because MDE is moving to the Meta Cloud API.
 *
 * RECOVERED SOURCE
 * The deployed v39 source was downloaded and is byte-identical to
 * docs/_archive/legacy-active-docs-2026-09-18/tasks/backup/edge-functions-2026-05-24/deployed-live/supabase/functions/whatsapp-webhook/index.ts
 * (sha256 65522081f60f0608...). It is preserved for rollback/diagnosis only.
 *
 * ROLLBACK
 * `supabase functions deploy whatsapp-webhook` from the archived directory restores v39.
 * Do not do that; it reopens the vulnerability. Roll forward instead.
 */

const GONE_BODY = JSON.stringify({
  error: {
    code: "GONE",
    message: "This legacy WhatsApp endpoint is retired. Use the Meta Cloud API channel.",
  },
});

const HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
} as const;

/** Pure, side-effect-free request gate. Exported so it can be tested without a server. */
export function handler(req: Request): Response {
  // CORS preflight is answered without widening any origin.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  // Every other method: no body read, no credentials, no database, no provider call.
  return new Response(GONE_BODY, { status: 403, headers: HEADERS });
}

export const DENY_STATUS = 403;
