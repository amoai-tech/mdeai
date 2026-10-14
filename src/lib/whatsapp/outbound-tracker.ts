import { AsyncLocalStorage } from "node:async_hooks";

/**
 * SAN-1444 — capture EVERY physical WhatsApp send for the message a worker is processing.
 *
 * Two facts drive this design:
 *  1. The Chat SDK resolves the `waitUntil` task even when the agent or the outbound send fails,
 *     so "the task settled" is not proof of delivery.
 *  2. The installed WhatsApp adapter splits long text (and multi-attachment messages) into
 *     SEVERAL Meta API calls and only returns the LAST id, so wrapping `postMessage` would miss
 *     every earlier chunk.
 *
 * The adapter sends through the global `fetch`, so a per-message tracking scope records each
 * physical `/messages` response (success id or failure). Completion then requires that no send
 * failed and at least one carried a provider id.
 */
export type OutboundSend =
  | { success: true; providerMessageId: string | null; content: string }
  | { success: false; error: string };

export type SendOutcome = "full" | "partial" | "failed";

/** A send Meta accepted, with the provider id needed to track delivery later. */
export type ConfirmedSend = { wamid: string; content: string };

type Scope = { sends: OutboundSend[] };

const storage = new AsyncLocalStorage<Scope>();

export function isTrackingOutbound(): boolean {
  return storage.getStore() !== undefined;
}

/** No-op when no scope is active, so ordinary (non-worker) sends are unaffected. */
export function recordOutboundSend(send: OutboundSend): void {
  storage.getStore()?.sends.push(send);
}

/**
 * Every accepted send with a provider id — not just the last. Streaming replies and chunked text
 * produce several WhatsApp messages, and each one needs its own delivery tracking.
 */
export function confirmedSends(sends: OutboundSend[]): ConfirmedSend[] {
  const confirmed: ConfirmedSend[] = [];
  for (const send of sends) {
    if (send.success === true && send.providerMessageId) {
      confirmed.push({ wamid: send.providerMessageId, content: send.content });
    }
  }
  return confirmed;
}

/**
 * A reply is only "full" when every physical send Meta accepted carried an id and none failed.
 * "partial" means the customer received some but not all of it, which must never look complete.
 */
export function sendOutcome(sends: OutboundSend[]): SendOutcome {
  const confirmed = confirmedSends(sends);
  const failures = sends.filter((send) => send.success === false);
  if (confirmed.length === 0) return "failed";
  return failures.length > 0 ? "partial" : "full";
}

export async function runWithOutboundTracking<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; sends: OutboundSend[] }> {
  const scope: Scope = { sends: [] };
  const result = await storage.run(scope, fn);
  return { result, sends: scope.sends };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return (input as { url?: string }).url ?? "";
}

/** A physical outbound message: the Meta messages endpoint with a WhatsApp payload. */
function isWhatsAppSend(url: string, body: string): boolean {
  return /\/messages(\?|$)/.test(url) && body.includes("messaging_product");
}

function replyText(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      text?: { body?: unknown };
      caption?: unknown;
      interactive?: { body?: { text?: unknown } };
    };
    if (typeof parsed.text?.body === "string") return parsed.text.body;
    if (typeof parsed.caption === "string") return parsed.caption;
    if (typeof parsed.interactive?.body?.text === "string") return parsed.interactive.body.text;
    return "";
  } catch {
    return "";
  }
}

let interceptorInstalled = false;

/**
 * Wrap the global `fetch` ONCE so each physical WhatsApp send is recorded inside the active
 * tracking scope. Outside a scope this is a transparent pass-through; the response body is read
 * from a clone, so the adapter still consumes the original.
 */
export function installWhatsAppSendInterceptor(): void {
  if (interceptorInstalled) return;
  interceptorInstalled = true;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const body = typeof init?.body === "string" ? init.body : "";
    const tracked = isTrackingOutbound() && isWhatsAppSend(url, body);
    let response: Response;
    try {
      response = await original(input, init);
    } catch (error) {
      if (tracked) {
        recordOutboundSend({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
    if (!tracked) return response;
    try {
      const payload = (await response.clone().json()) as {
        messages?: Array<{ id?: unknown }>;
        error?: { message?: unknown };
      };
      const id = payload.messages?.[0]?.id;
      if (typeof id === "string" && id.trim() !== "") {
        recordOutboundSend({ success: true, providerMessageId: id, content: replyText(body) });
      } else {
        recordOutboundSend({
          success: false,
          error:
            typeof payload.error?.message === "string"
              ? payload.error.message
              : "Meta response had no message id",
        });
      }
    } catch {
      recordOutboundSend({
        success: false,
        error: "Meta response was not JSON (status " + response.status + ")",
      });
    }
    return response;
  }) as typeof fetch;
}
