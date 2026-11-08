import type { Processor, ProcessOutputStreamArgs } from "@mastra/core/processors";

function failureMessage(reason: unknown, spanish: boolean): string {
  switch (reason) {
    case "route_quota_per_user_exceeded":
      return spanish
        ? "Has alcanzado tu límite diario de consultas de rutas. Inténtalo de nuevo mañana."
        : "You've reached your daily route-request limit. Please try again tomorrow.";
    case "route_quota_exceeded":
      return spanish
        ? "Se alcanzó el límite diario de consultas de rutas. Inténtalo de nuevo mañana."
        : "Today's route-request limit has been reached. Please try again tomorrow.";
    case "route_quota_disabled":
    case "route_quota_unavailable":
      return spanish
        ? "El servicio de rutas no está disponible temporalmente. Inténtalo de nuevo más tarde."
        : "Route calculations are temporarily unavailable. Please try again later.";
    case "invalid_route_request":
      return spanish
        ? "Necesito un origen y un destino válidos para calcular la ruta. ¿Puedes indicar las ubicaciones exactas?"
        : "I need valid starting and destination locations. Could you provide the exact places?";
    default:
      return spanish
        ? "Google Maps no pudo calcular esta ruta. No tengo una distancia ni un tiempo de viaje verificados, así que no voy a inventarlos."
        : "Google Maps could not calculate this route. I don't have a verified distance or travel time, so I won't guess.";
  }
}

/**
 * SAN-465: a genuine compute-route result is required for distance/ETA claims.
 * Gemini has been observed estimating "5–10 minutes" even after a null result.
 * Replace only that failed route turn's text, at the existing Mastra output
 * boundary, before CopilotKit/AG-UI or memory can display/persist the guess.
 */
const SEPARATE_ANSWER_TOOLS = new Set([
  "searchGroundedPlacesTool",
  "search-grounded-places",
  "searchRestaurantsTool",
  "search-restaurants",
  "searchRentalsTool",
  "search-rentals",
  "searchEventsTool",
  "search-events",
  "searchAttractionsTool",
  "search-attractions",
  "lookupPublicDiscoveryItem",
  "lookup-public-discovery-item",
  "readBrokerWorkspace",
  "read-broker-workspace",
]);

export const routeUnavailableOutputGuard = {
  id: "san465-route-unavailable-output",
  async processOutputStream({ part, state, messageList }: ProcessOutputStreamArgs) {
    if (part.type === "tool-result") {
      if (part.payload.toolName !== "computeRouteTool" &&
          part.payload.toolName !== "compute-route") {
        // Only a separate user-facing result may clear the failed-route guard.
        // Memory/bookkeeping tools must not re-enable an estimated ETA.
        if (SEPARATE_ANSWER_TOOLS.has(part.payload.toolName)) {
          state.routeUnavailable = false;
          state.routeUnavailableEmitted = false;
          state.routeFailureReason = undefined;
        }
        return part;
      }
      const result = part.payload.result;
      if (result && typeof result === "object" && "route" in result) {
        state.routeUnavailable = result.route === null;
        state.routeUnavailableEmitted = false;
        state.routeFailureReason = "reason" in result ? result.reason : undefined;
      }
      return part;
    }

    if (part.type !== "text-delta" || state.routeUnavailable !== true) {
      return part;
    }
    if (state.routeUnavailableEmitted === true) {
      // Drop *all* subsequent model-generated text for the failed route.
      return null;
    }
    state.routeUnavailableEmitted = true;

    let spanish = false;
    try {
      const recentUser = messageList?.get.all.db().filter((m) => m.role === "user").at(-1);
      const userText = recentUser?.content.parts
        ?.filter((p) => p.type === "text")
        .map((p) => p.text)
        .join(" ") ?? "";
      spanish = /[¿¡]|\b(cu[aá]nto|cu[aá]l|desde|entre|ruta|caminar|caminando)\b/i.test(userText);
    } catch {
      // A broken message snapshot must not re-enable an unsupported ETA.
    }
    return {
      ...part,
      payload: { ...part.payload, text: failureMessage(state.routeFailureReason, spanish) },
    };
  },
} satisfies Processor;
