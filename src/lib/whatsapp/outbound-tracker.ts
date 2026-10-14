import { AsyncLocalStorage } from "node:async_hooks";

/**
 * SAN-1444 — capture the outbound send for the message a worker is currently processing.
 *
 * The Chat SDK acknowledges the webhook before the agent replies, and it resolves the
 * `waitUntil` task even when the agent or the outbound send fails. "The task settled" is
 * therefore NOT proof that the customer received anything.
 *
 * The worker opens a tracking scope around one message; the WhatsApp adapter's `postMessage`
 * records each attempt into that scope. Completion then requires a SUCCESSFUL send, so a failed
 * agent run or a rejected Meta API call leaves the row retryable instead of `processed`.
 */
export type OutboundSend =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

type Scope = { sends: OutboundSend[] };

const storage = new AsyncLocalStorage<Scope>();

export function isTrackingOutbound(): boolean {
  return storage.getStore() !== undefined;
}

/** No-op when no scope is active, so ordinary (non-worker) sends are unaffected. */
export function recordOutboundSend(send: OutboundSend): void {
  storage.getStore()?.sends.push(send);
}

export async function runWithOutboundTracking<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; sends: OutboundSend[] }> {
  const scope: Scope = { sends: [] };
  const result = await storage.run(scope, fn);
  return { result, sends: scope.sends };
}
