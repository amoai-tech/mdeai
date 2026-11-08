/**
 * SAN-465: a travel-time question must reach Google Routes before the model
 * answers. The model otherwise estimates from memory; forcing the existing
 * compute-route tool on the first step makes the answer provider-backed.
 */
type Message = { role: string; content: unknown };
type ToolStep = { toolCalls?: readonly { toolName?: string }[] };

const ROUTE_QUERY =
  /\b(how long|how far|distance|walk|walking|drive|driving|bike|bicycling|bicycle|cycle|transit|route|commute|directions|from\b.+\bto\b|cu[aá]nto (?:se )?(?:tarda|camina)|c[oó]mo llegar|distancia|ruta|a pie|caminando|en auto|en bici|desde\b.+\bhasta\b)\b/i;

const ROUTE_TOOL_NAMES = new Set(["computeRouteTool", "compute-route"]);

function userText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object" || !("parts" in content) || !Array.isArray(content.parts)) return "";
  return content.parts
    .filter((p): p is { type: "text"; text: string } =>
      p != null && typeof p === "object" && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join(" ");
}

export function isRouteQuestion(text: string): boolean {
  if (!ROUTE_QUERY.test(text)) return false;
  // A café/place discovery query is not a route request unless it names a route verb.
  return /\b(from|to|desde|hasta|how long|how far|distance|route|ruta|commute|directions)\b/i.test(text) ||
    /\bde\b.+\ba\b/i.test(text);
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
