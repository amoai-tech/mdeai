import { AsyncLocalStorage } from "node:async_hooks";

/**
 * SAN-1444 — capture the outbound sends for the message a worker is currently processing.
 *
 * The Chat SDK acknowledges the webhook before the agent replies, and it resolves the
 * `waitUntil` task even when the agent or the outbound send fails. "The task settled" is
 * therefore NOT proof that the customer received anything.
 *
 * The worker opens a tracking scope around one message; the WhatsApp adapter's `postMessage`
 * records every attempt into that scope. Completion then requires a SUCCESSFUL send carrying a
 * provider message id, so a failed agent run or a rejected Meta call leaves the row retryable.
 */
export type OutboundSend =
  | { success: true; providerMessageId: string | null; content: string }
  | { success: false; error: string };

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
 * Every accepted send with a provider id — not just the first. Streaming replies produce several
 * WhatsApp messages, and each one needs its own delivery tracking.
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

export async function runWithOutboundTracking<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; sends: OutboundSend[] }> {
  const scope: Scope = { sends: [] };
  const result = await storage.run(scope, fn);
  return { result, sends: scope.sends };
}
