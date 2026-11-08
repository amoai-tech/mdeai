/**
 * SAN-465: force the existing route tool only when the user clearly asks for a
 * route and both endpoints are present. Otherwise the model must ask for the
 * missing endpoint instead of inventing one.
 */
type Message = { role: string; content: unknown };
type ToolStep = { toolCalls?: readonly { toolName?: string }[] };

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

const GENERIC_ORIGIN = /^(?:(?:the|this|that|my|our|your)\s+)?(?:apartment|rental|listing|place|home|hotel|airbnb|house|office)$/i;
const ENDPOINT_VERB = /^(pie|meet|eat|see|get|walk|drive|bike|ride|take|go|visit|stay|book|pay|leave|arrive)\b/i;

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
    const origin = match[1]?.trim();
    const destination = match[2]?.trim();
    if (origin && destination && isPlaceLike(origin) && isPlaceLike(destination)) {
      return { origin, destination };
    }
  }
  return null;
}

export function isRouteQuestion(text: string): boolean {
  return TRAVEL_INTENT.test(text) && routeEndpoints(text) !== null;
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
  const lastUser = messages.findLast((m) => m.role === "user");
  if (!lastUser || !isRouteQuestion(userText(lastUser.content))) return false;
  return !steps.some((step) =>
    step.toolCalls?.some((call) => ROUTE_TOOL_NAMES.has(call.toolName || "")),
  );
}

const ROUTE_TOOL_NAMES = new Set(["computeRouteTool", "compute-route"]);
