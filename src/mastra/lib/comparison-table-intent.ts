import { readRentalResultIds } from "./generative-ui-context";

type MessageLike = { role?: string; content?: unknown };

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

const TABLE_REQUEST = /\b(table|tabular|side[\s-]?by[\s-]?side)\b/i;
const RENTAL_REFERENCE =
  /\b(apartments?|listings?|rentals?|these|those|them|first|second|third|fourth|fifth|two|three|four|five|\d+)\b/i;
const COMPARISON_WORD = /\b(compare|comparison|versus|vs\.?|cheaper|better|difference)\b/i;
const TABLE_COMMAND = /\b(put|show|display|render|make|create|build)\b/i;
const NEW_SEARCH = /\b(find|search|discover|look(?:ing)? for|new search|another|different)\b|\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)[\s-]*(?:br|bed|bedrooms?)\b|\bunder\s+(?:cop|usd|\$|\d)/i;
const RESTAURANT_TABLE = /\b(book|reserve|reservation|restaurant|caf[eé]|nightlife|table for|party size)\b/i;

/**
 * An explicit "put those apartments in a table" is a UI command. The model
 * answers it with Markdown (measured), so the first step is pinned to the one
 * ID-list tool that produces the official Column → Table. New searches,
 * ordinary comparisons, and restaurant table bookings are excluded.
 */
export function shouldForceComparisonTable({
  stepNumber,
  messages,
  requestContext,
}: {
  stepNumber: number;
  messages: readonly MessageLike[];
  requestContext?: { get?: (key: string) => unknown };
}): boolean {
  if (stepNumber !== 0) return false;
  if (readRentalResultIds(requestContext?.get?.("ag-ui")).length < 2) return false;
  const lastUser = [...messages].reverse().find((message) => message?.role === "user");
  const text = messageText(lastUser).trim();
  if (!text) return false;
  if (!TABLE_REQUEST.test(text)) return false;
  if (RESTAURANT_TABLE.test(text)) return false;
  if (!RENTAL_REFERENCE.test(text)) return false;
  if (!COMPARISON_WORD.test(text) && !TABLE_COMMAND.test(text)) return false;
  return !NEW_SEARCH.test(text);
}
