import { EventType, type BaseEvent } from "@ag-ui/client";
import { Observable } from "rxjs";
import { buildRentalRecommendationOps } from "./rental-recommendations-ui";
import { buildRentalFilterControlOps } from "./rental-filter-control-ui";

/** The model-facing tool name is the Mastra map key; the id may also appear. */
const RECOMMENDATION_TOOLS = new Set([
  "showRecommendations",
  "showRecommendationsTool",
  "show-recommendations",
]);

/** SAN-1655 — the bedroom control is its own tool, with the same transport. */
const FILTER_CONTROL_TOOLS = new Set([
  "showRentalFilterControl",
  "showRentalFilterControlTool",
  "show-rental-filter-control",
]);

/** The tool result may arrive as an object or as a JSON string, with or without an envelope. */
export function recommendationIdsFromResult(content: unknown): string[] {
  let value: unknown = content;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!value || typeof value !== "object") return [];
  const payload = value as { ids?: unknown; ok?: unknown; result?: unknown };
  if (payload.ok === false) return [];
  if (Array.isArray(payload.ids)) return payload.ids.filter((id): id is string => typeof id === "string");
  // Mastra may nest the tool output under `result`.
  if (payload.result && typeof payload.result === "object") {
    return recommendationIdsFromResult(payload.result);
  }
  return [];
}

/**
 * A `render_ui` call with server-built, valid operations. This is what the
 * runtime's generative-UI middleware validates and turns into surface
 * activities; the model never authors the operation JSON.
 */
/**
 * A rejected control call must not render: `{ ok: false }` carries no control.
 * The recommendation path already refuses failed results; this is the same rule.
 */
export function filterControlOk(content: unknown): boolean {
  let value: unknown = content;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  if (!value || typeof value !== "object") return false;
  const payload = value as { ok?: unknown; result?: unknown };
  if (payload.ok === false) return false;
  if (payload.ok === true) return true;
  if (payload.result && typeof payload.result === "object") return filterControlOk(payload.result);
  return false;
}

export function filterControlRenderEvents(toolCallId: string): BaseEvent[] {
  const built = buildRentalFilterControlOps(`rental-filters-${toolCallId}`);
  const callId = `render-ui-filters-${toolCallId}`;
  return [
    { type: EventType.TOOL_CALL_START, toolCallId: callId, toolCallName: "render_ui" },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: callId, delta: JSON.stringify(built) },
    { type: EventType.TOOL_CALL_END, toolCallId: callId },
  ] as BaseEvent[];
}

export function renderUiEventsFor(ids: readonly string[], toolCallId: string): BaseEvent[] | null {
  const built = buildRentalRecommendationOps(ids, `rental-recs-${toolCallId}`);
  if (!built) return null;
  const callId = `render-ui-${toolCallId}`;
  return [
    { type: EventType.TOOL_CALL_START, toolCallId: callId, toolCallName: "render_ui" },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: callId, delta: JSON.stringify(built) },
    { type: EventType.TOOL_CALL_END, toolCallId: callId },
  ] as BaseEvent[];
}

/*
 * ponytail: this bridge is a deliberate ceiling. The deterministic path has
 * produced two grounded cards in three consecutive signed-in runs. The free-form
 * official path has one live observation (one card), and that observation
 * predates the NearbyRentalAction provider fix, so it is not a fair comparison:
 * re-measure the official path after that fix before removing anything. Upgrade
 * path: forward the official guide only (already shipped), run 3x with no tool,
 * and delete this file, the tool and the intent processor in one change.
 *
 * Live evidence for that decision: 2026-11-10, signed-in rental QA, three
 * consecutive runs, two grounded cards each (0cdd6677…, 0db74081…).
 */

/**
 * Watches the agent stream for a completed `show_recommendations` call and
 * appends the synthetic `render_ui` call that renders its IDs. Other tools and
 * every other event pass through untouched.
 */
export function emitRecommendationSurface<T extends BaseEvent>(): (source: Observable<T>) => Observable<T> {
  return (source) =>
    new Observable<T>((subscriber) => {
      const names = new Map<string, string>();
      return source.subscribe({
        next: (event) => {
          const e = event as unknown as { type?: string; toolCallId?: string; toolCallName?: string; content?: unknown };
          if (e.type === EventType.TOOL_CALL_START && e.toolCallId && e.toolCallName) {
            names.set(e.toolCallId, e.toolCallName);
          }
          subscriber.next(event);
          if (e.type !== EventType.TOOL_CALL_RESULT || !e.toolCallId) return;
          const name = names.get(e.toolCallId) ?? "";
          if (FILTER_CONTROL_TOOLS.has(name)) {
            if (!filterControlOk(e.content)) return;
            for (const synthetic of filterControlRenderEvents(e.toolCallId)) {
              subscriber.next(synthetic as unknown as T);
            }
            return;
          }
          if (!RECOMMENDATION_TOOLS.has(name)) return;
          const ids = recommendationIdsFromResult(e.content);
          for (const synthetic of renderUiEventsFor(ids, e.toolCallId) ?? []) {
            subscriber.next(synthetic as unknown as T);
          }
        },
        error: (error) => subscriber.error(error),
        complete: () => subscriber.complete(),
      });
    });
}
