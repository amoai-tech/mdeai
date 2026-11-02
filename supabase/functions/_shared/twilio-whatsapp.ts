/**
 * Twilio WhatsApp client for Supabase Edge Functions (Deno) — D11.5.
 *
 * Direct REST call to Twilio Messages API (no @twilio/sdk because Deno
 * + esm.sh wrappers add 200kB to bundle for one POST). Uses Basic auth
 * with `TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN`.
 *
 * Sandbox vs production:
 *   - Sandbox uses `TWILIO_SANDBOX_NUMBER` (always +14155238886).
 *     Recipient must have texted `join <code>` once to opt in.
 *   - Production uses your purchased + WA-enabled number
 *     (`TWILIO_PHONE_NUMBER`). Requires Meta Business verification +
 *     approved templates for outside-24h-window sends.
 *
 * Per-user request: NO retries, NO status callbacks, NO complex
 * tracking. Caller logs `whatsapp_sent_at` on its own UPDATE-RETURNING
 * for idempotency. If Twilio returns 4xx the lead is still in the
 * inbox — the landlord sees it on next dashboard open.
 */ type TwilioConfig = { accountSid: string; username: string; password: string; fromNumber: string };
type TwilioMessage = { toE164: string; body: string };
type TwilioResult = { ok: boolean; sid?: string; status?: string; httpStatus?: number; errorCode?: number; errorMessage?: string };
const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
/** Pull config from edge-fn env. Caller decides sandbox vs production.
 * Auth precedence: API Key + Secret > Account SID + Auth Token. */ export function loadTwilioConfig(useSandbox: boolean): TwilioConfig | null {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  if (!accountSid) return null;
  const fromNumber = useSandbox ? Deno.env.get("TWILIO_SANDBOX_NUMBER") : Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!fromNumber) return null;
  const apiKey = Deno.env.get("TWILIO_API_KEY");
  const apiSecret = Deno.env.get("TWILIO_API_SECRET");
  if (apiKey && apiSecret) {
    return {
      accountSid,
      username: apiKey,
      password: apiSecret,
      fromNumber
    };
  }
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (authToken) {
    return {
      accountSid,
      username: accountSid,
      password: authToken,
      fromNumber
    };
  }
  return null;
}

/** True when every character is a hex digit. Length-bounded loops only — no regex, no backtracking. */
function hasOnlyHex(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLower = code >= 97 && code <= 102;
    const isUpper = code >= 65 && code <= 70;
    if (!isDigit && !isLower && !isUpper) return false;
  }
  return true;
}

/**
 * Send one freeform WhatsApp message. Fire-and-forget at the call site
 * (we never throw — caller decides whether to surface failures). Returns
 * `{ ok: false, ... }` on any non-2xx Twilio response so the caller can
 * log without try/catch noise.
 */ export async function sendWhatsApp(config: TwilioConfig, args: TwilioMessage): Promise<TwilioResult> {
  // The Account SID comes from the function's own environment, never from the request, but it
  // still decides the request URL. Validate its shape so nothing malformed can steer the request.
  // A character-by-character check is used instead of a regex: the shape is fixed-length, and a
  // regex here trips ReDoS heuristics for a value that is 34 characters by construction.
  const sid = config.accountSid;
  if (sid.length !== 34 || !sid.startsWith("AC") || !hasOnlyHex(sid.slice(2))) {
    return { ok: false, errorMessage: "Twilio account SID is not a valid AC… identifier" };
  }
  // The path is built from a constant base and an Account SID that has just been proven to be
  // 32 hex characters. The SID originates in TWILIO_ACCOUNT_SID (function configuration), never
  // in the request body or headers, so no caller input reaches this URL.
  const url = `${TWILIO_API_BASE}/Accounts/${sid}/Messages.json`;
  const auth = btoa(`${config.username}:${config.password}`);
  const body = new URLSearchParams({
    From: `whatsapp:${normalizeE164(config.fromNumber)}`,
    To: `whatsapp:${normalizeE164(args.toE164)}`,
    Body: args.body.slice(0, 1600)
  });
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
  } catch (err) {
    return {
      ok: false,
      errorMessage: `Twilio fetch failed: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  let json: { sid?: string; status?: string; code?: number; message?: string } | null = null;
  try {
    json = await response.json();
  } catch  {
  // Twilio returns JSON for both success + error. If parse fails the
  // response is unusable — surface the HTTP status.
  }
  if (response.ok) {
    return {
      ok: true,
      sid: json?.sid,
      status: json?.status,
      httpStatus: response.status
    };
  }
  return {
    ok: false,
    errorCode: json?.code,
    errorMessage: json?.message ?? `HTTP ${response.status}`,
    httpStatus: response.status
  };
}
/** Normalize "+57 300 123 4567" / "(+57) 300-123-4567" → "+573001234567". */ function normalizeE164(input: string) {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D+/g, "");
  return hasPlus ? `+${digits}` : digits;
}
