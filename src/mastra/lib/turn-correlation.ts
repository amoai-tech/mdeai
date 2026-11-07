/**
 * C1 · one identifier for an AI turn, shared across every boundary.
 *
 * B2's open question is "where did this request die?" — browser, auth, runtime,
 * Mastra, the model, or the stream. Answering it needs a single value that appears in
 * every log line and every error for the same turn, so a failure can be followed
 * instead of guessed at.
 *
 * Rules:
 * - a caller-supplied `x-mde-request-id` is honoured so browser and server agree;
 * - an unsafe value is rejected, never echoed into logs (no newlines, no control
 *   characters, bounded length);
 * - no request content is read or recorded here.
 */

const CORRELATION_HEADERS = ["x-mde-request-id", "x-request-id"] as const;
const SAFE_ID = /^[A-Za-z0-9._:-]{8,64}$/;

export interface TurnCorrelation {
  requestId: string;
  startedAt: number;
  /** Milliseconds elapsed since the turn started. */
  elapsedMs(now?: number): number;
}

export function resolveTurnCorrelation(
  request: Request,
  now: number = Date.now(),
): TurnCorrelation {
  const supplied = CORRELATION_HEADERS.map((name) => request.headers.get(name)).find(
    (value): value is string => typeof value === "string" && SAFE_ID.test(value),
  );
  const requestId = supplied ?? globalThis.crypto.randomUUID();
  return {
    requestId,
    startedAt: now,
    elapsedMs: (at: number = Date.now()) => Math.max(0, at - now),
  };
}

/** One structured boundary line. No prompts, no message bodies, no tokens. */
export function logTurnBoundary(entry: {
  requestId: string;
  phase: "request" | "auth" | "runtime" | "run" | "stream" | "error";
  durationMs: number;
  status?: string;
  detail?: string;
}): void {
  const payload = {
    requestId: entry.requestId,
    phase: entry.phase,
    durationMs: Math.max(0, Math.round(entry.durationMs)),
    ...(entry.status ? { status: entry.status } : {}),
    ...(entry.detail ? { detail: entry.detail } : {}),
  };
  // One line, greppable by requestId: `[mde-turn] {"requestId":…}`.
  console.log(`[mde-turn] ${JSON.stringify(payload)}`);
}

/** Response header that lets the browser correlate its own timing with the server. */
export const REQUEST_ID_HEADER = "x-mde-request-id";
