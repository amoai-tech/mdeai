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
const ORDINAL = /(?:\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(?:10|[1-9])(?:st|nd|rd|th)?\b)/gi;
const EXPLICIT_RESULT_PAIR = /\b(?:compare|comparison)\b/i;
export const COMPARISON_POSITIONS_KEY = "mdeai-comparison-requested-positions";

const NUMBERED_RESULT = "(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|one|two|three|four|five|six|seven|eight|nine|ten|(?:10|[1-9])(?:st|nd|rd|th)?)";
const NUMBERED_TOKEN = new RegExp(String.raw`\b(${NUMBERED_RESULT})\b`, "gi");
const LIST_SEPARATOR = /^\s*(?:,\s*(?:and\s+)?|(?:and|&|versus|vs\.?)\s+)$/i;
const NUMBER_WORDS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const CARDINAL_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
function resultNumber(word: string): number | null {
  const normalized = word.toLowerCase();
  const ordinal = NUMBER_WORDS.indexOf(normalized);
  if (ordinal >= 0) return ordinal + 1;
  const cardinal = CARDINAL_WORDS.indexOf(normalized);
  if (cardinal >= 0) return cardinal + 1;
  const digit = Number.parseInt(normalized, 10);
  return Number.isInteger(digit) && digit >= 1 && digit <= 10 ? digit : null;
}

/** Ground explicit ordinals in the current displayed order before any model IDs. */
export function comparisonRequestedPositions(messages: readonly MessageLike[]): number[] | null {
  const lastUser = [...messages].reverse().find((message) => message?.role === "user");
  const text = messageText(lastUser).trim();
  const firstTwo = /\b(?:first|top)\s+(?:two|2)\s+(?:apartments?|listings?|rentals?|results?)\b/i.exec(text);
  if (firstTwo) {
    const extra = text.slice(firstTwo.index + firstTwo[0].length);
    const additions = Array.from(
      extra.matchAll(new RegExp(String.raw`(?:,|\band\b)\s*(?:the\s+)?(${NUMBERED_RESULT})\b`, "gi")),
      (match) => resultNumber(match[1]),
    ).filter((value): value is number => value !== null);
    const unique = [...new Set([1, 2, ...additions])];
    return unique.length <= 5 ? unique : null;
  }

  // A connected list of ordinals, not just the last pair. Plain counts such as
  // "show two apartments" must not be mistaken for a requested card index.
  const tokens = [...text.matchAll(NUMBERED_TOKEN)];
  let sequence: number[] = [];
  const sequences: number[][] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const gap = text.slice(tokens[i].index! + tokens[i][0].length, tokens[i + 1].index!);
    const left = resultNumber(tokens[i][0]);
    const right = resultNumber(tokens[i + 1][0]);
    if (LIST_SEPARATOR.test(gap) && left !== null && right !== null) {
      if (!sequence.length) sequence.push(left);
      sequence.push(right);
    } else if (sequence.length) {
      sequences.push(sequence);
      sequence = [];
    }
  }
  if (sequence.length) sequences.push(sequence);
  if (sequences.length !== 1) return null;
  const positions = [...new Set(sequences[0])];
  return positions.length >= 2 && positions.length <= 5 ? positions : null;
}
const RENTAL_REFERENCE =
  /\b(apartments?|listings?|rentals?|these|those|them|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i;
const COMPARISON_WORD = /\b(compare|comparison|versus|vs\.?|cheaper|better|difference)\b/i;
const TABLE_COMMAND = /\b(put|show|display|render|make|create|build)\b/i;
const NEW_SEARCH = /\b(find|search|discover|look(?:ing)? for|new search|another|different)\b|\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)[\s-]*(?:br|bed|bedrooms?)\b|\bunder\s+(?:cop|usd|\$|\d)/i;
const RESTAURANT_TABLE = /\b(book|reserve|reservation|restaurant|caf[eé]|nightlife|table for|party size)\b/i;
// Explicit other verticals override ordinal pronouns, even when rental hints exist.
const OTHER_COMPARISON_DOMAIN = /\b(?:new\s+projects?|projects?|startups?|companies|events?|tickets?|trips?|hotels?)\b/i;

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
  // Unambiguous pairs of already-shown positions are comparisons too, even
  // when the renter does not literally say "table".
  const references = text.match(ORDINAL) ?? [];
  const ordinalPair = references.length >= 2 && EXPLICIT_RESULT_PAIR.test(text);
  if (!TABLE_REQUEST.test(text) && !ordinalPair) return false;
  if (RESTAURANT_TABLE.test(text) || OTHER_COMPARISON_DOMAIN.test(text)) return false;
  if (!RENTAL_REFERENCE.test(text)) return false;
  if (!COMPARISON_WORD.test(text) && !TABLE_COMMAND.test(text)) return false;
  return !NEW_SEARCH.test(text);
}


/**
 * Once the first step used the grounded comparison tool, finish in text.
 * The stream bridge already emits the official Table from that tool result.
 * An extra model-authored render_ui can create an empty surface over the
 * valid table (observed on a real 390px renter run in production).
 */
export function shouldFinishComparisonWithoutAnotherTool({
  stepNumber,
  messages,
  requestContext,
}: {
  stepNumber: number;
  messages: readonly MessageLike[];
  requestContext?: { get?: (key: string) => unknown };
}): boolean {
  return stepNumber > 0 && shouldForceComparisonTable({ stepNumber: 0, messages, requestContext });
}
