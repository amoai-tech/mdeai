/** Module-level store for concierge RUN_ERROR signals.
 *
 * CopilotKit's ToastProvider suppresses bannerError in production (enabled=false when
 * not localhost). Wiring onError at the CopilotKit provider boundary is the only reliable
 * cross-env way to detect stream failures. This tiny store bridges that callback to UI
 * subscribers via useSyncExternalStore, avoiding setState-in-effect and ref-read-in-render
 * rules.
 *
 * A failure belongs to the conversation that produced it. Without that identity, an old
 * error can show Retry in a different chat and replay the wrong turn.
 */

export type ConciergeErrorSnapshot = {
  version: number;
  threadId: string | null;
  /** The failed operation to replay. Absent for legacy/provider-only errors. */
  retry?: () => void | Promise<unknown>;
};

export type ConciergeErrorInput = {
  threadId?: string | null;
  retry?: () => void | Promise<unknown>;
};

const IDLE: ConciergeErrorSnapshot = { version: 0, threadId: null };
let _error: ConciergeErrorSnapshot = IDLE;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((l) => l());
}

export function reportConciergeError(
  input?: string | null | ConciergeErrorInput,
) {
  const threadId =
    typeof input === "string" || input === null ? input : input?.threadId;
  const retry =
    typeof input === "object" && input !== null ? input.retry : undefined;
  _error = { version: _error.version + 1, threadId: threadId ?? null, retry };
  notify();
}

/** Clear the current failure. Pass a thread id to avoid clearing another chat's error. */
export function clearConciergeError(threadId?: string | null) {
  if (
    threadId !== undefined &&
    _error.threadId !== null &&
    _error.threadId !== threadId
  ) {
    return;
  }
  if (_error.version !== 0) {
    _error = IDLE;
    notify();
  }
}

export function subscribeConciergeError(listener: () => void) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function getConciergeErrorSnapshot(): ConciergeErrorSnapshot {
  return _error;
}

export function getConciergeErrorVersion() {
  return _error.version;
}

export function getConciergeErrorVersionServer() {
  return 0;
}

export function getConciergeErrorSnapshotServer(): ConciergeErrorSnapshot {
  return IDLE;
}
