import { AsyncLocalStorage } from "node:async_hooks";

/**
 * SAN-1444 — capture EVERY physical WhatsApp send for the message a worker is processing, and
 * hold the run's reply text so the customer gets one message.
 *
 * Two facts drive this design:
 *  1. The Chat SDK resolves the `waitUntil` task even when the agent or the outbound send fails,
 *     so "the task settled" is not proof of delivery.
 *  2. The adapter splits long text (and multi-attachment messages) into SEVERAL Meta API calls
 *     and returns only the LAST id, so wrapping `postMessage` would miss earlier chunks.
 *
 * The adapter sends through the global `fetch`, so a per-message scope records each physical
 * `/messages` payload (success id or failure). Reply text is buffered during the run and flushed
 * INSIDE the same scope, so every chunk of the final answer is still observed.
 */
export type OutboundSend =
  | { success: true; providerMessageId: string | null; content: string }
  | { success: false; error: string };

export type SendOutcome = "full" | "partial" | "failed";

/** A send Meta accepted, with the provider id needed to track delivery later. */
export type ConfirmedSend = { wamid: string; content: string };

type BufferedText = { threadId: string; text: string };
type BufferedFlusher = (threadId: string, text: string) => Promise<string | null>;

type Scope = { sends: OutboundSend[]; buffered: BufferedText[]; flusher: BufferedFlusher | null };

const storage = new AsyncLocalStorage<Scope>();

export function isTrackingOutbound(): boolean {
  return storage.getStore() !== undefined;
}

/** No-op when no scope is active, so ordinary (non-worker) sends are unaffected. */
export function recordOutboundSend(send: OutboundSend): void {
  storage.getStore()?.sends.push(send);
}

/** Hold reply text until the whole run finishes (Mastra's static driver flushes per step). */
export function bufferOutboundText(threadId: string, text: string): void {
  const scope = storage.getStore();
  if (scope && text.trim() !== "") scope.buffered.push({ threadId, text });
}

/**
 * Register how the buffered reply should be sent. The wrapper binds this to the SPECIFIC adapter
 * instance that produced the text, so concurrent runs cannot route a reply through another
 * sender (no process-global adapter reference).
 */
export function setBufferedFlusher(flusher: BufferedFlusher): void {
  const scope = storage.getStore();
  if (scope) scope.flusher = flusher;
}

/**
 * Send the run's final reply exactly once. MUST be called inside the tracking scope so the
 * resulting physical sends (the adapter may split a long answer) are recorded, not just the last.
 */
export async function flushBufferedReply(): Promise<string | null> {
  const scope = storage.getStore();
  if (!scope || !scope.flusher) return null;
  const last = scope.buffered.at(-1);
  if (!last) return null;
  return scope.flusher(last.threadId, last.text);
}

/** Every accepted send with a provider id — not just the last. */
export function confirmedSends(sends: OutboundSend[]): ConfirmedSend[] {
  const confirmed: ConfirmedSend[] = [];
  for (const send of sends) {
    if (send.success === true && send.providerMessageId) {
      confirmed.push({ wamid: send.providerMessageId, content: send.content });
    }
  }
  return confirmed;
}

/** A reply is only "full" when every physical send carried an id and none failed. */
export function sendOutcome(sends: OutboundSend[]): SendOutcome {
  const confirmed = confirmedSends(sends);
  const failures = sends.filter((send) => send.success === false);
  if (confirmed.length === 0) return "failed";
  return failures.length > 0 ? "partial" : "full";
}

export async function runWithOutboundTracking<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; sends: OutboundSend[] }> {
  const scope: Scope = { sends: [], buffered: [], flusher: null };
  const result = await storage.run(scope, fn);
  return { result, sends: scope.sends };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return (input as { url?: string }).url ?? "";
}

/**
 * A physical outbound MESSAGE — not a read receipt or a typing indicator.
 *
 * All three share the Meta `/messages` endpoint, but Meta answers receipts and typing with
 * `{ "success": true }` and no message id. Counting those as sends would mark every reply
 * "partial" and dead-letter it, so require an actual message payload (`type`).
 */
function isWhatsAppSend(url: string, method: string, body: string): boolean {
  if (method.toUpperCase() !== "POST") return false;
  const path = url.split("?")[0];
  if (!path.endsWith("/messages") || !body.includes("messaging_product")) return false;
  try {
    const parsed = JSON.parse(body) as {
      type?: unknown;
      status?: unknown;
      typing_indicator?: unknown;
    };
    if (parsed.typing_indicator !== undefined || parsed.status !== undefined) return false;
    return typeof parsed.type === "string";
  } catch {
    return false;
  }
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
    const tracked = isTrackingOutbound() && isWhatsAppSend(url, init?.method ?? "", body);
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
