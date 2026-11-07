import { AsyncLocalStorage } from "node:async_hooks";

/**
 * C1 · one identifier for an AI turn, shared across every boundary.
 *
 * B2's open question is "where did this request die?" — browser, auth, runtime, Mastra,
 * the model, or the stream. A single value that appears in every boundary line lets a
 * failure be followed instead of guessed at.
 *
 * Two ids, deliberately:
 * - `attemptId` comes from the browser (`x-mde-attempt-id`) so a UI symptom can be
 *   matched to a server log line;
 * - `requestId` is always server-owned, so a caller cannot forge another user's id.
 *
 * No request content is read or recorded here.
 */

const ATTEMPT_HEADER = "x-mde-attempt-id";
const LEGACY_HEADER = "x-request-id";
const SAFE_ID = /^[A-Za-z0-9._:-]{8,64}$/;

export interface TurnCorrelation {
  /** Server-owned; authoritative for logs. */
  requestId: string;
  /** Browser-provided when safe, otherwise the server id. */
  attemptId: string;
  startedAt: number;
  elapsedMs(now?: number): number;
}

const storage = new AsyncLocalStorage<TurnCorrelation>();

/** Make the current turn's correlation readable from any logging path. */
export function withTurnCorrelation<T>(correlation: TurnCorrelation, fn: () => T): T {
  return storage.run(correlation, fn);
}

export function getTurnCorrelation(): TurnCorrelation | undefined {
  return storage.getStore();
}

function safeHeader(request: Request, name: string): string | undefined {
  const value = request.headers.get(name);
  return typeof value === "string" && SAFE_ID.test(value) ? value : undefined;
}

export function resolveTurnCorrelation(
  request: Request,
  now: number = Date.now(),
): TurnCorrelation {
  const attemptId =
    safeHeader(request, ATTEMPT_HEADER) ?? safeHeader(request, LEGACY_HEADER) ?? undefined;
  const requestId = globalThis.crypto.randomUUID();
  return {
    requestId,
    attemptId: attemptId ?? requestId,
    startedAt: now,
    elapsedMs: (at: number = Date.now()) => Math.max(0, at - now),
  };
}

export type TurnPhase = "request" | "auth" | "runtime" | "stream" | "error";

/** One structured boundary line. No prompts, no message bodies, no tokens. */
export function logTurnBoundary(entry: {
  requestId: string;
  attemptId?: string;
  phase: TurnPhase;
  durationMs: number;
  status?: string;
  detail?: string;
}): void {
  const payload = {
    requestId: entry.requestId,
    ...(entry.attemptId ? { attemptId: entry.attemptId } : {}),
    phase: entry.phase,
    durationMs: Math.max(0, Math.round(entry.durationMs)),
    ...(entry.status ? { status: entry.status } : {}),
    ...(entry.detail ? { detail: entry.detail } : {}),
  };
  console.log(`[mde-turn] ${JSON.stringify(payload)}`);
}

/**
 * Observe the AI stream, not just the response headers.
 *
 * A `200` proves only that headers were sent. The failure B2 describes is a 200 whose
 * stream then produced no usable text, so completion, cancellation and errors are
 * recorded separately from the header boundary.
 */
export function observeTurnStream(
  response: Response,
  correlation: TurnCorrelation,
): Response {
  if (!response.body) return response;
  // Only an AI event stream can be "missing an answer". A normal JSON response (a thread
  // list, an info payload) is not a turn at all, and classifying it as metadata-only
  // would create false B2 alarms.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) return response;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let firstChunkMs: number | null = null;
  let settled = false;
  let sawAssistantText = false;
  let buffer = "";
  const TEXT_MARKER = "TEXT_MESSAGE_CONTENT";

  /**
   * Inspect one SSE frame for a REAL assistant text delta.
   *
   * Searching for the marker string anywhere is not enough: a tool payload can mention
   * it, and a `TEXT_MESSAGE_CONTENT` with an empty or whitespace `delta` still carries no
   * answer. The AG-UI contract is `{ type, delta }`, so both are checked.
   */
  const frameHasAssistantText = (frame: string) => {
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: unknown };
        if (
          event?.type === "TEXT_MESSAGE_CONTENT" &&
          typeof event.delta === "string" &&
          event.delta.trim().length > 0
        ) {
          return true;
        }
      } catch {
        // A non-JSON data line cannot prove assistant text.
      }
    }
    return false;
  };

  const finish = (phase: TurnPhase, status: string) => {
    if (settled) return;
    settled = true;
    logTurnBoundary({
      requestId: correlation.requestId,
      attemptId: correlation.attemptId,
      phase,
      durationMs: correlation.elapsedMs(),
      status,
      detail: `bytes=${bytes}${firstChunkMs === null ? "" : ` firstChunkMs=${firstChunkMs}`}`,
    });
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          finish("stream", bytes === 0 ? "empty" : sawAssistantText ? "complete" : "metadata_only");
          controller.close();
          return;
        }
        if (firstChunkMs === null) firstChunkMs = correlation.elapsedMs();
        bytes += value?.byteLength ?? 0;
        if (!sawAssistantText && value) {
          // Frames may be split across reads, so only complete `\n\n` frames are judged
          // and the remainder is carried into the next chunk.
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            if (frameHasAssistantText(frame)) {
              sawAssistantText = true;
              break;
            }
            boundary = buffer.indexOf("\n\n");
          }
          // Keep the buffer bounded: a stream that never emits a blank line must not grow
          // without limit, and the marker alone is longer than this window.
          if (!sawAssistantText && buffer.length > 64_000) {
            buffer = buffer.slice(-(TEXT_MARKER.length * 4));
          }
        }
        controller.enqueue(value);
      } catch (error) {
        finish("error", "stream_failed");
        controller.error(error);
      }
    },
    cancel(reason) {
      finish("stream", "cancelled");
      return reader.cancel(reason);
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** Response header that lets the browser correlate its own timing with the server. */
export const REQUEST_ID_HEADER = "x-mde-request-id";
export const ATTEMPT_ID_HEADER = ATTEMPT_HEADER;
