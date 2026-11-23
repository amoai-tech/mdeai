import { hasUsableRentalRunResults, readRentalResultIds } from "./generative-ui-context";

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
export const COMPARISON_COP_MONTHLY_BUDGET_KEY = "mdeai-comparison-cop-monthly-budget";

/** Server-read COP ceiling for an explicit same-message comparison query.
 * The canonical rental search applies the actual SQL filter; the table
 * independently rejects rows outside this ceiling if a model omitted it. */
export function comparisonCopMonthlyBudget(messages: readonly MessageLike[]): number | null {
  const text = messageText([...messages].reverse().find((message) => message?.role === "user"));
  const match = /\b(?:under|below|at most)\s+COP\s*(\d+(?:[.,]\d+)*)\s*(million|millones|m)?\b/i.exec(text);
  if (!match) return null;
  const suffix = match[2]?.toLowerCase();
  const amount = suffix
    ? Number(match[1].replace(",", ".")) * 1_000_000
    : Number(match[1].replace(/[,.]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// Use literal patterns: the ordinal vocabulary is fixed, not user-supplied.
const NUMBERED_TOKEN = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|one|two|three|four|five|six|seven|eight|nine|ten|(?:10|[1-9])(?:st|nd|rd|th)?)\b/gi;
const ADDITIONAL_POSITION = /(?:,|\b(?:and|with|versus|vs)\b\.?|&)\s*(?:(?:the\s+)|(?:(?:apartment|listing|rental|result)s?\s+))?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|one|two|three|four|five|six|seven|eight|nine|ten|(?:10|[1-9])(?:st|nd|rd|th)?)\b(?!\s*(?:columns?|rows?|features?|amenities?|bedrooms?|beds?|bathrooms?)\b)/gi;
// Only 1–10 are supported display ordinals. Larger numeric references must
// never disappear from a server-trusted apartment selection.
const UNSUPPORTED_NUMBERED_TOKEN = /\b(?:1[1-9]|[2-9]\d+)(?:st|nd|rd|th)?\b/i;
// Numbers describing table layout or features are never displayed apartment
// positions, including when a numbered list precedes them.
const NON_APARTMENT_NUMBER = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:columns?|rows?|features?|amenities?|bedrooms?|beds?|bathrooms?)\b/i;
const LIST_SEPARATOR = /^\s*(?:(?:apartments?|listings?|rentals?)\s+)?(?:,\s*(?:and\s+)?|(?:and|&|versus|vs\.?|with)\s+)(?:the\s+)?$/i;
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
  if (UNSUPPORTED_NUMBERED_TOKEN.test(text) || NON_APARTMENT_NUMBER.test(text)) return null;
  const firstTwo = /\b(?:first|top)\s+(?:two|2)\s+(?:apartments?|listings?|rentals?|results?)\b/i.exec(text);
  if (firstTwo) {
    // Do not make a partial trusted list when a renter named an apartment
    // earlier in the sentence (e.g. fifth + first two).
    if ([...text.slice(0, firstTwo.index).matchAll(NUMBERED_TOKEN)].length) return null;
    // "find the cheaper one" refers to the selected pair, not apartment #1.
    // Ignore only that comparative pronoun; unknown extra ordinals still fail closed.
    const extra = text.slice(firstTwo.index + firstTwo[0].length)
      .replace(/\b(?:cheaper|cheapest|better|more affordable|less expensive)\s+one\b/gi, "");
    const additions = Array.from(
      extra.matchAll(ADDITIONAL_POSITION),
      (match) => {
        // "with 5" is not an apartment position; "with the fifth" or
        // "with the 5th" clearly is. Never add a bare table dimension.
        if (/\bwith\s+\d+$/i.test(match[0])) return null;
        return resultNumber(match[1]);
      },
    ).filter((value): value is number => value !== null);
    // Never trust an incomplete partial list; the model can handle phrases
    // this conservative parser cannot yet unambiguously understand.
    if ([...extra.matchAll(NUMBERED_TOKEN)].length !== additions.length) return null;
    // "with 5 columns" is a layout request, not apartment 5; "with the
    // fifth" explicitly references a displayed apartment.
    if (/\bwith\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+columns?\b/i.test(extra)) return null;
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
  if (sequences.length !== 1 || sequences[0].length !== tokens.length) return null;
  const positions = [...new Set(sequences[0])];
  return positions.length >= 2 && positions.length <= 5 ? positions : null;
}
const RENTAL_REFERENCE =
  /\b(apartments?|listings?|rentals?|these|those|them|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i;
const COMPARISON_WORD = /\b(compare|comparison|versus|vs\.?|cheaper|better|difference)\b/i;
const TABLE_COMMAND = /\b(put|show|display|render|make|create|build)\b/i;
// Discovery must name rental inventory, not simply "find the cheaper one" from
// already visible cards. A trailing budget is an instruction to filter, even
// when the user mentions "first two" earlier in the sentence.
const NEW_SEARCH = /\b(?:find|search|discover|look(?:ing)? for)\b/i;
const RENTAL_INVENTORY = /\b(?:apartments?|listings?|rentals?|properties|homes?)\b/i;
const ANALYSIS_FIND = /\bfind\s+(?:the\s+)?(?:cheaper|cheapest|better|lowest-priced|most affordable)\s+(?:one\b|(?:of|between|from)\s+(?:the\s+)?(?:first|top|these|those|two|\d+))/i;
const COMPARISON_START = /\b(?:compare|comparison|table|tabular|side[\s-]?by[\s-]?side|versus|vs)\b/i;
const RENTAL_SEARCH_FILTER =
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)[\s-]*(?:br|bed|bedrooms?)\b|\bunder\s+(?:cop|usd|\$|\d)/i;
const RENTAL_BUDGET = /\b(?:under|below|less than|at most)\s+(?:(?:cop|usd)\s*)?\$?\s*\d/i;
const DISPLAYED_ORDINAL =
  /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|these|those|them)\b|\b(?:apartments?|rentals?|listings?|results?)\s+(?:10|[1-9])\b/i;
const BEDROOM_CATEGORY_COMPARISON = /\bcompare\s+(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)[\s-]*(?:br|bed|bedrooms?)\s+(?:apartments?|rentals?|listings?))\s+(?:in\s+\w+\s+)?(?:with|versus|vs\.?)/i;
function requestsRentalSearchBeforeComparison(text: string): boolean {
  const comparisonAt = text.search(COMPARISON_START);
  const prefix = comparisonAt < 0 ? text : text.slice(0, comparisonAt);
  if (RENTAL_BUDGET.test(text)) return true;
  if (NEW_SEARCH.test(prefix) && RENTAL_INVENTORY.test(prefix) && !ANALYSIS_FIND.test(prefix)) return true;
  const filter = RENTAL_SEARCH_FILTER.exec(text);
  return Boolean(filter && !DISPLAYED_ORDINAL.test(text.slice(0, filter.index)));
}
/** Mark a requested rental discovery before parallel consumer tools start.
 * A generic "find the cheaper one" is analysis, not discovery. */
export function requestsFreshRentalDiscovery(messages: readonly MessageLike[]): boolean {
  const text = messageText([...messages].reverse().find((message) => message?.role === "user")).trim();
  if (!text) return false;
  return (NEW_SEARCH.test(text) && RENTAL_INVENTORY.test(text) && !ANALYSIS_FIND.test(text)) ||
    (RENTAL_BUDGET.test(text) && RENTAL_INVENTORY.test(text));
}
const RESTAURANT_TABLE = /\b(book|reserve|reservation|restaurant|caf[eé]|nightlife|table for|party size)\b/i;
// Explicit other verticals override ordinal pronouns, even when rental hints exist.
const OTHER_COMPARISON_DOMAIN = /\b(?:new\s+projects?|projects?|startups?|companies|events?|tickets?|trips?|hotels?)\b/i;

function hasExplicitRentalComparisonRequest(messages: readonly MessageLike[]): boolean {
  const lastUser = [...messages].reverse().find((message) => message?.role === "user");
  const text = messageText(lastUser).trim();
  if (!text || RESTAURANT_TABLE.test(text) || OTHER_COMPARISON_DOMAIN.test(text) ||
      BEDROOM_CATEGORY_COMPARISON.test(text)) return false;
  const references = text.match(ORDINAL) ?? [];
  const ordinalPair = references.length >= 2 && EXPLICIT_RESULT_PAIR.test(text);
  return (TABLE_REQUEST.test(text) || ordinalPair) && RENTAL_REFERENCE.test(text) &&
    (COMPARISON_WORD.test(text) || TABLE_COMMAND.test(text));
}

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
  return Boolean(text) && hasExplicitRentalComparisonRequest(messages) && !requestsRentalSearchBeforeComparison(text);
}

/** For a same-message search and explicit comparison, ground the search first. */
export function shouldSearchBeforeComparison({
  stepNumber, messages, steps,
}: {
  stepNumber: number;
  messages: readonly MessageLike[];
  steps: readonly CompletedToolStep[];
}): boolean {
  if (stepNumber !== 0 || !hasExplicitRentalComparisonRequest(messages)) return false;
  const text = messageText([...messages].reverse().find((message) => message?.role === "user")).trim();
  return requestsRentalSearchBeforeComparison(text) && !hasAttemptedTool(steps, "searchRentalsTool");
}

/** After the forced search result, force the requested table against its new cards. */
export function shouldContinueComparisonAfterSearch({
  stepNumber, messages, steps, requestContext,
}: {
  stepNumber: number;
  messages: readonly MessageLike[];
  steps: readonly CompletedToolStep[];
  requestContext?: { get?: (key: string) => unknown };
}): boolean {
  if (stepNumber === 0 || !hasExplicitRentalComparisonRequest(messages)) return false;
  const text = messageText([...messages].reverse().find((message) => message?.role === "user")).trim();
  return requestsRentalSearchBeforeComparison(text) &&
    hasCompletedTool(steps, "searchRentalsTool") &&
    hasUsableRentalRunResults(requestContext) &&
    !hasAttemptedTool(steps, "showComparisonTable");
}


/**
 * Once the first step used the grounded comparison tool, finish in text.
 * The stream bridge already emits the official Table from that tool result.
 * An extra model-authored render_ui can create an empty surface over the
 * valid table (observed on a real 390px renter run in production).
 */
type CompletedToolStep = {
  toolCalls?: readonly { toolName?: string }[];
  toolResults?: readonly { toolName?: string }[];
};
/** A tool call alone is not enough: wait until its result is in the step. */
export function hasCompletedTool(
  steps: readonly CompletedToolStep[],
  toolName: string,
): boolean {
  return steps.some((step) => step.toolResults?.some((result) => result.toolName === toolName));
}

/** One attempted tool per turn, even when its execution threw before
 * producing a tool result. Do not repeatedly force failing calls. */
export function hasAttemptedTool(
  steps: readonly CompletedToolStep[],
  toolName: string,
): boolean {
  return steps.some((step) =>
    step.toolCalls?.some((call) => call.toolName === toolName) ||
    step.toolResults?.some((result) => result.toolName === toolName));
}

/** The first route step may override the initial table choice; retry table
 * after that route's result, but only once. */
export function shouldContinueComparisonAfterRoute({
  stepNumber, messages, requestContext, steps, hasRouteIntent,
}: {
  stepNumber: number;
  messages: readonly MessageLike[];
  requestContext?: { get?: (key: string) => unknown };
  steps: readonly CompletedToolStep[];
  hasRouteIntent: boolean;
}): boolean {
  return stepNumber > 0 && hasRouteIntent &&
    shouldForceComparisonTable({ stepNumber: 0, messages, requestContext }) &&
    hasAttemptedTool(steps, "computeRouteTool") &&
    !hasAttemptedTool(steps, "showComparisonTable");
}

/** If the table ran first, the walking route is still owed to the renter. */
export function shouldContinueRouteAfterComparison({
  stepNumber, messages, requestContext, steps, hasRouteIntent,
}: {
  stepNumber: number;
  messages: readonly MessageLike[];
  requestContext?: { get?: (key: string) => unknown };
  steps: readonly CompletedToolStep[];
  hasRouteIntent: boolean;
}): boolean {
  return stepNumber > 0 && hasRouteIntent &&
    shouldForceComparisonTable({ stepNumber: 0, messages, requestContext }) &&
    hasAttemptedTool(steps, "showComparisonTable") &&
    !hasAttemptedTool(steps, "computeRouteTool");
}

export function shouldFinishComparisonWithoutAnotherTool({
  stepNumber, messages, requestContext, steps = [], hasRouteIntent = false,
}: {
  stepNumber: number;
  messages: readonly MessageLike[];
  requestContext?: { get?: (key: string) => unknown };
  steps?: readonly CompletedToolStep[];
  hasRouteIntent?: boolean;
}): boolean {
  if (stepNumber === 0 || !shouldForceComparisonTable({ stepNumber: 0, messages, requestContext })) return false;
  // Do not suppress the table when route processing ran first.
  if (!hasCompletedTool(steps, "showComparisonTable")) return false;
  // Conversely, finish only after both results for combined requests.
  return !hasRouteIntent || hasCompletedTool(steps, "computeRouteTool");
}
