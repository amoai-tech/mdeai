import { readRentalResultHints } from "./generative-ui-context";

type MessageLike = { role?: string; content?: unknown };

/** Text of a message across the shapes the thread stores (string, parts, JSON string). */
function messageText(message: MessageLike | undefined): string {
  const content = message?.content;
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content) as { parts?: Array<{ type?: string; text?: string }>; content?: string };
      return parsed.parts?.find((part) => part.type === "text")?.text ?? parsed.content ?? "";
    } catch {
      return content;
    }
  }
  if (content && typeof content === "object") {
    const parsed = content as { parts?: Array<{ type?: string; text?: string }>; content?: string };
    return parsed.parts?.find((part) => part.type === "text")?.text ?? parsed.content ?? "";
  }
  return "";
}

/**
 * "Show these as cards" fails non-deterministically when the model is free to
 * choose: live runs searched again, or answered in text, and the panel stayed
 * empty even though the page had already published its authorized IDs.
 *
 * MDE already pins a tool for one narrow intent (booking continuation). This is
 * the same pattern for one narrow intent on the Rentals page: when the user asks
 * to SEE the current results as cards and real IDs are published, point the
 * first step at `render_ui`. It never runs without IDs, so it cannot force a
 * card for data the page does not have.
 */
const SHOW_AS_CARDS = /\b(show|display|render|see)\b[\s\S]*\bcards?\b/i;
const ASKS_FOR_DETAILS = /\b(details?|open|book|schedule)\b/i;

export function shouldForceRenderUi({
  stepNumber,
  messages,
  requestContext,
}: {
  stepNumber: number;
  messages: readonly MessageLike[];
  requestContext?: { get?: (key: string) => unknown };
}): boolean {
  if (stepNumber !== 0) return false;
  // No published page IDs means nothing safe to render.
  if (!readRentalResultHints(requestContext?.get?.("ag-ui"))) return false;

  const lastUser = [...messages].reverse().find((message) => message?.role === "user");
  const text = messageText(lastUser).trim();
  if (!text) return false;
  if (!SHOW_AS_CARDS.test(text)) return false;
  // "Show details" is not "show a card"; that path belongs to openRentalDetails.
  return !ASKS_FOR_DETAILS.test(text);
}
