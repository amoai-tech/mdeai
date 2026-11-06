import type { ProcessInputStepArgs } from "@mastra/core/processors";
import { isEventCardRenderRequest } from "@/lib/event-search-fast-path";

const EVENT_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
      return "";
    })
    .join(" ");
}

function newestUserText(messages: readonly unknown[]): string {
  const newest = messages[messages.length - 1] as { role?: string; content?: unknown } | null;
  return newest?.role === "user" ? contentText(newest.content) : "";
}

function activeEventId(systemMessages: readonly unknown[]): string | null {
  const text = systemMessages.map((message) => {
    const value = message as { content?: unknown } | null;
    return contentText(value?.content);
  }).join("\n");
  const hintsAt = text.indexOf("Active event result ID hints");
  if (hintsAt < 0) return null;
  return text.slice(hintsAt).match(EVENT_ID)?.[0] ?? null;
}

/**
 * The event ID and card instruction are already in the prompt, but Gemini may
 * still choose a search or a clarification. Force only the existing render_ui
 * tool for the first step of an explicit card request with a real event ID.
 */
export function forceEventCardRender(args: {
  stepNumber: number;
  messages: readonly unknown[];
  systemMessages?: readonly unknown[];
  tools?: Record<string, unknown>;
}) {
  if (args.stepNumber !== 0) return null;
  if (!activeEventId(args.systemMessages ?? [])) return null;
  if (!isEventCardRenderRequest(newestUserText(args.messages))) return null;
  // render_ui is added by the A2UI transport; forcing a missing tool can make
  // the provider reject the step.
  if (!args.tools || !Object.prototype.hasOwnProperty.call(args.tools, "render_ui")) return null;
  return { toolChoice: { type: "tool" as const, toolName: "render_ui" } };
}

export function eventCardRenderProcessor() {
  return {
    id: "san1630-event-card-tool-choice",
    processInputStep: (args: ProcessInputStepArgs) => forceEventCardRender(args) ?? {},
  };
}
