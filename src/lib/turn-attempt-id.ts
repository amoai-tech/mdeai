/**
 * Browser half of C1: a fresh attempt id for every AI request.
 *
 * The server can only correlate a request that reached it. A request that dies in the
 * browser — offline, aborted during navigation, blocked before headers — never gives the
 * server a chance to mint an id, so the browser must generate one first and send it.
 *
 * The server treats this value as an ATTEMPT id, never as its own request id, so a
 * caller cannot forge another user's log line.
 */
export const ATTEMPT_ID_HEADER = "x-mde-attempt-id";

/**
 * Matches the server's accepted shape: 8–64 chars of `[A-Za-z0-9._:-]`, so the value is
 * honoured rather than silently replaced. `att-` + UUID = 40 characters.
 */
export function newAttemptId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return `att-${cryptoApi.randomUUID()}`;
  }
  // Bounded fallback for an environment without randomUUID; still 8-64 safe chars.
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
