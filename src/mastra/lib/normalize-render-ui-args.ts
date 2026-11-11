import { EventType, type BaseEvent } from "@ag-ui/client";
import { Observable } from "rxjs";

/** The only catalog protocol this runtime accepts. */
const A2UI_VERSION = "1.0";

type Operation = Record<string, unknown>;

/**
 * The model reliably emits A2UI operation bodies (`{createSurface:{…}}`) but
 * omits the required `"version":"1.0"` envelope, so the runtime rejects every
 * operation and nothing renders. Measured live: six operations, six rejections,
 * across three runs and two prompt revisions.
 *
 * This adds the constant envelope when it is missing and leaves anything else
 * untouched. It cannot invent content: `version` is a protocol constant, and an
 * operation without it is already invalid. Returns null when nothing changed so
 * the caller can pass the original arguments through unchanged.
 */
export function normalizeRenderUiArgs(argsJson: string): string | null {
  if (!argsJson.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(argsJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const payload = parsed as { operations?: unknown; version?: unknown };
  if (!Array.isArray(payload.operations)) return null;

  const topLevelVersion = typeof payload.version === "string" ? payload.version : A2UI_VERSION;
  let changed = false;
  const operations = payload.operations.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const operation = raw as Operation;
    if (typeof operation.version === "string" && operation.version.trim()) return operation;
    // Only an operation body this runtime knows how to version is rewritten.
    const hasKnownBody = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"]
      .some((key) => key in operation);
    if (!hasKnownBody) return operation;
    changed = true;
    return { version: topLevelVersion, ...operation };
  });

  if (!changed) return null;
  return JSON.stringify({ ...payload, operations });
}

/**
 * Holds `render_ui` argument deltas and re-emits one normalised delta before
 * the call ends, so the runtime's validator sees the required envelope.
 * Every other tool call streams through untouched.
 */
export function normalizeRenderUiToolArgs<T extends BaseEvent>(): (source: Observable<T>) => Observable<T> {
  return (source) =>
    new Observable<T>((subscriber) => {
      const buffers = new Map<string, string>();
      const held = new Set<string>();
      return source.subscribe({
        next: (event) => {
          const e = event as unknown as { type?: string; toolCallId?: string; toolCallName?: string; delta?: string };
          if (e.type === EventType.TOOL_CALL_START && e.toolCallName === "render_ui" && e.toolCallId) {
            held.add(e.toolCallId);
            subscriber.next(event);
            return;
          }
          if (e.type === EventType.TOOL_CALL_ARGS && e.toolCallId && held.has(e.toolCallId)) {
            buffers.set(e.toolCallId, (buffers.get(e.toolCallId) ?? "") + (e.delta ?? ""));
            return;
          }
          if (e.type === EventType.TOOL_CALL_END && e.toolCallId && held.has(e.toolCallId)) {
            const raw = buffers.get(e.toolCallId) ?? "";
            buffers.delete(e.toolCallId);
            held.delete(e.toolCallId);
            const normalized = normalizeRenderUiArgs(raw);
            if (raw) {
              subscriber.next({
                ...(event as object),
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: e.toolCallId,
                delta: normalized ?? raw,
              } as unknown as T);
            }
            subscriber.next(event);
            return;
          }
          subscriber.next(event);
        },
        error: (error) => subscriber.error(error),
        complete: () => subscriber.complete(),
      });
    });
}
