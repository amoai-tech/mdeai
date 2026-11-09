/**
 * SAN-465: force the existing route tool only when the user clearly asks for a
 * route and both endpoints are present. Otherwise the model must ask for the
 * missing endpoint instead of inventing one.
 *
 * The forces are deterministic: the same parsed plan is handed to the tool via
 * RequestContext so Google receives the places the user actually named and the
 * travel mode they actually asked for. The model cannot substitute invented
 * place IDs for those endpoints.
 */
type Message = { role: string; content: unknown };
type ToolStep = { toolCalls?: readonly { toolName?: string }[] };

export type RouteTravelMode = "WALK" | "DRIVE" | "BICYCLE" | "TRANSIT";

export type RouteTurnPlan = {
  origin: string;
  destination: string;
  travelMode: RouteTravelMode;
};

/** RequestContext key shared by the concierge processor and compute-route. */
export const MDEAI_ROUTE_PLAN_KEY = "mdeaiRoutePlan";

const TRAVEL_INTENT =
  /\b(how long|how far|distance|walk|walking|drive|driving|bike|bicycling|bicycle|cycle|transit|route|commute|directions|a pie|caminando|en auto|en bici|transporte|ruta|distancia|cu[aá]nto (?:se )?(?:tarda|camina)|c[oó]mo llegar)\b/i;

const ENDPOINT_PATTERNS = [
  /\bfrom\s+(.{2,80}?)\s+to\s+(.{2,80}?)(?:[?.!,]|$)/i,
  /\b(?:de|desde)\s+(.{2,80}?)\s+(?:a|hasta)\s+(.{2,80}?)(?:[?.!,]|$)/i,
  /\bbetween\s+(.{2,80}?)\s+and\s+(.{2,80}?)(?:[?.!,]|$)/i,
  /\bentre\s+(.{2,80}?)\s+y\s+(.{2,80}?)(?:[?.!,]|$)/i,
];

const NOT_A_PLACE =
  /\b(\d+\s*(?:mil|million|millones|habitaciones?|bedrooms?|am|pm|hours?|min|minutes?)|price|precio|usd|cop|table|mesa)\b/i;

const GENERIC_ORIGIN = /^(?:(?:the|this|that|my|our|your)\s+)?(?:apartment|rental|listing|place|home|hotel|airbnb|house|office|here|aqu[ií]|ac[aá])$/i;
const ENDPOINT_VERB = /^(pie|meet|eat|see|get|walk|drive|bike|ride|take|go|visit|stay|book|pay|leave|arrive)\b/i;

/** A short reply that only changes the travel mode of the previous route. */
const MODE_FOLLOW_UP =
  /^(?:and\s+|y\s+)?(?:by car|driving|by bike|cycling|walking|transit|public transport|en auto|en bici|caminando|transporte)\s*\??$/i;

/**
 * A destination may end with the mode the user mentioned ("... to the airport
 * by car"). That clause is a mode, not part of the place name; Places must
 * search "the airport", not "the airport by car".
 */
const TRAILING_MODE =
  /\s+(?:(?:by|on)\s+(?:car|auto|taxi|uber|didi|bike|bicycle|foot|walking|transit|bus|metro|public transport)|en\s+(?:auto|carro|bici|bicicleta|transporte|bus|metro)|(?:driving|walking|cycling|bicycling))\s*$/i;

function cleanEndpoint(value: string): string {
  let text = value.trim();
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(TRAILING_MODE, "").trim();
  }
  return text;
}

function isPlaceLike(value: string): boolean {
  const text = value.trim();
  if (text.length < 2 || text.length > 80) return false;
  if (NOT_A_PLACE.test(text) || GENERIC_ORIGIN.test(text) || ENDPOINT_VERB.test(text)) return false;
  return /[\p{L}]/u.test(text);
}

export function routeEndpoints(text: string): { origin: string; destination: string } | null {
  for (const pattern of ENDPOINT_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const origin = cleanEndpoint(match[1] ?? "");
    const destination = cleanEndpoint(match[2] ?? "");
    if (origin && destination && isPlaceLike(origin) && isPlaceLike(destination)) {
      return { origin, destination };
    }
  }
  return null;
}

export function isRouteQuestion(text: string): boolean {
  return TRAVEL_INTENT.test(text) && routeEndpoints(text) !== null;
}

/** The user's requested travel mode; default WALK, matching the tool schema. */
export function routeTravelMode(text: string): RouteTravelMode {
  if (/\b(?:bike|bikes|bicycling|bicycle|cycling|cycle|en bici|en bicicleta)\b/i.test(text)) {
    return "BICYCLE";
  }
  if (/\b(?:drive|driving|car|auto|taxi|uber|didi|en carro)\b/i.test(text)) {
    return "DRIVE";
  }
  if (/\b(?:transit|public transport|bus|metro|transporte)\b/i.test(text)) {
    return "TRANSIT";
  }
  return "WALK";
}

function userText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object" || !("parts" in content) || !Array.isArray(content.parts)) return "";
  return content.parts
    .filter((p): p is { type: "text"; text: string } =>
      p != null && typeof p === "object" && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join(" ");
}

/**
 * The verified plan for this turn: the two places the user named and the mode
 * they asked for. A short mode-only follow-up reuses the previous route's
 * endpoints, so "And by car?" still calls Google instead of estimating.
 */
export function routePlanForTurn(messages: readonly Message[]): RouteTurnPlan | null {
  const userMessages = messages.filter((m) => m.role === "user");
  const lastUser = userMessages.at(-1);
  if (!lastUser) return null;
  const text = userText(lastUser.content);

  if (isRouteQuestion(text)) {
    const endpoints = routeEndpoints(text);
    return endpoints ? { ...endpoints, travelMode: routeTravelMode(text) } : null;
  }

  const previousUser = userMessages.at(-2);
  if (!previousUser) return null;
  const previousText = userText(previousUser.content);
  if (!isRouteQuestion(previousText)) return null;
  const followUp = text.trim().replace(/^¿+/, "");
  if (!MODE_FOLLOW_UP.test(followUp)) return null;
  const endpoints = routeEndpoints(previousText);
  return endpoints ? { ...endpoints, travelMode: routeTravelMode(text) } : null;
}

export function shouldForceRouteTool({
  stepNumber,
  messages,
  steps,
}: {
  stepNumber: number;
  messages: readonly Message[];
  steps: readonly ToolStep[];
}): boolean {
  if (stepNumber !== 0) return false;
  if (!routePlanForTurn(messages)) return false;
  return !steps.some((step) =>
    step.toolCalls?.some((call) => ROUTE_TOOL_NAMES.has(call.toolName || "")),
  );
}

/** Read back the plan the concierge processor stored for this turn. */
export function getRoutePlan(context?: unknown): RouteTurnPlan | null {
  const requestContext = (context as { requestContext?: { get?: (key: string) => unknown } } | undefined)
    ?.requestContext;
  let raw: unknown;
  try {
    raw = requestContext?.get?.(MDEAI_ROUTE_PLAN_KEY);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const { origin, destination, travelMode } = record;
  if (typeof origin !== "string" || typeof destination !== "string") return null;
  if (!origin.trim() || !destination.trim()) return null;
  if (travelMode !== "WALK" && travelMode !== "DRIVE" && travelMode !== "BICYCLE" && travelMode !== "TRANSIT") {
    return null;
  }
  return { origin: origin.trim(), destination: destination.trim(), travelMode };
}

const ROUTE_TOOL_NAMES = new Set(["computeRouteTool", "compute-route"]);
