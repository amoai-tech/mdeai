/**
 * A selected business is UI context for one AG-UI run, not a user identity.
 * The CopilotKit server independently checks the signed-in user's membership.
 * Unlike a shared cookie, this selector cannot be overwritten by another tab.
 */
export const PARTNER_SELECTION_CONTEXT_DESCRIPTION = "mde.partnerSelection.v1";

const PARTNER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extract an untrusted partner ID from this partnerAgent run or reconnect. */
export async function readPartnerSelectionFromRun(request: Request): Promise<string | null> {
  if (request.method !== "POST") return null;

  try {
    // Clone: the CopilotKit handler still needs to read the original body.
    const envelope = (await request.clone().json()) as {
      method?: unknown;
      params?: { agentId?: unknown };
      body?: { context?: unknown };
    } | null;

    if (
      (envelope?.method !== "agent/run" && envelope?.method !== "agent/connect") ||
      envelope.params?.agentId !== "partnerAgent"
    ) {
      return null;
    }

    const entries = envelope.body?.context;
    if (!Array.isArray(entries)) return null;

    const matches = entries.filter(
      (entry: unknown) =>
        !!entry &&
        typeof entry === "object" &&
        (entry as { description?: unknown }).description === PARTNER_SELECTION_CONTEXT_DESCRIPTION,
    );
    // Conflicting selectors must not cause the server to guess which business.
    if (matches.length !== 1) return null;

    // CopilotKit serializes useAgentContext values as JSON strings.
    const raw = (matches[0] as { value?: unknown }).value;
    if (typeof raw !== "string" || raw.length > 512) return null;
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const id = (value as { partnerId?: unknown }).partnerId;
    return typeof id === "string" && PARTNER_ID_PATTERN.test(id) ? id.toLowerCase() : null;
  } catch {
    // An absent or invalid selector never bypasses auth or membership checks.
    return null;
  }
}

/**
 * CopilotKit v2 sends Stop with a thread ID and optional run ID, but no
 * useAgentContext. After the canonical user/thread owner check, a Stop for
 * partnerAgent may proceed without reading or replaying business content.
 * This does NOT relax the run/connect selection and binding checks.
 */
export async function isPartnerStopRequest(request: Request): Promise<boolean> {
  if (request.method !== "POST") return false;
  try {
    const envelope = (await request.clone().json()) as {
      method?: unknown;
      params?: { agentId?: unknown; threadId?: unknown };
    } | null;
    return (
      envelope?.method === "agent/stop" &&
      envelope.params?.agentId === "partnerAgent" &&
      typeof envelope.params.threadId === "string" &&
      envelope.params.threadId.trim().length > 0
    );
  } catch {
    return false;
  }
}
