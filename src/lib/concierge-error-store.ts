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

/**
 * CopilotKit v2 reports a refused runtime-info probe via onError even when no
 * assistant turn ran. A guest's 401 is expected; real connection and run
 * failures (including authenticated 401s) must remain visible.
 * Status comes from event.error.runtimeInfoStatus in our pinned CopilotKit
 * 1.75 provider; some core paths also supply context.runtimeStatus.
 */
export function isExpectedGuestStartup401(
  event: unknown,
  isAuthenticated: boolean,
  sessionLoading = false,
): boolean {
  // An unresolved session must never suppress an error: on a cold route the
  // fetch fails before getUser() resolves, and a real run failure arriving in
  // that window would disappear. Report until auth settles; only then can a
  // 401 be confidently called "expected guest".
  if (sessionLoading) return false;
  if (isAuthenticated || !event || typeof event !== "object") return false;
  const candidate = event as { code?: unknown; context?: unknown; error?: unknown };
  if (candidate.code !== "runtime_info_fetch_failed") return false;
  const context = candidate.context;
  const cause = candidate.error;
  // CopilotKit 1.75 emits the status on error.runtimeInfoStatus for the
  // single-route /info probe; other pinned core paths put it in context.
  const statusFromContext = typeof context === "object" && context !== null &&
    "runtimeStatus" in context ? context.runtimeStatus : undefined;
  const statusFromError = typeof cause === "object" && cause !== null &&
    "runtimeInfoStatus" in cause ? cause.runtimeInfoStatus : undefined;
  return statusFromContext === 401 || statusFromError === 401;
}

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
const GLOBAL_KEY = "__global__";
const _errors = new Map<string, ConciergeErrorSnapshot>();
let _last: ConciergeErrorSnapshot = IDLE;
let _version = 0;
const _listeners = new Set<() => void>();

function keyFor(threadId?: string | null) {
  return threadId ?? GLOBAL_KEY;
}

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
  _version += 1;
  const snapshot: ConciergeErrorSnapshot = {
    version: _version,
    threadId: threadId ?? null,
    retry,
  };
  // Keep a separate slot per conversation. A late failure from Chat A must
  // not overwrite Chat B's newer notice.
  _errors.set(keyFor(threadId), snapshot);
  _last = snapshot;
  notify();
}

/** Clear the current failure. Pass a thread id to avoid clearing another chat's error. */
export function clearConciergeError(threadId?: string | null) {
  if (threadId === undefined) {
    const hadError = _errors.size > 0;
    _errors.clear();
    _last = IDLE;
    _version = 0;
    if (hadError) notify();
    return;
  }
  const key = keyFor(threadId);
  if (!_errors.delete(key)) return;
  if (_last.threadId === (threadId ?? null)) _last = IDLE;
  notify();
}

export function subscribeConciergeError(listener: () => void) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function getConciergeErrorSnapshot(): ConciergeErrorSnapshot {
  return _last;
}

/** The notice that belongs to one conversation, never another chat's late error. */
export function getConciergeErrorForThread(
  threadId?: string | null,
): ConciergeErrorSnapshot {
  // Named conversations must not inherit a legacy unscoped error: doing so
  // could expose the wrong Retry action after switching chats.
  // Unscoped callers still read the legacy global slot via keyFor(undefined).
  return _errors.get(keyFor(threadId)) ?? IDLE;
}

export function getConciergeErrorVersion() {
  return _version;
}

export function getConciergeErrorVersionServer() {
  return 0;
}

export function getConciergeErrorSnapshotServer(): ConciergeErrorSnapshot {
  return IDLE;
}

export function getConciergeErrorForThreadServer(): ConciergeErrorSnapshot {
  return IDLE;
}
