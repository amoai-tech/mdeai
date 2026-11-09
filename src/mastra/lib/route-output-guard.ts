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

type GuardRoute = {
  distanceMeters: number;
  durationSeconds: number;
  travelMode: "WALK" | "DRIVE" | "BICYCLE" | "TRANSIT";
  warning?: string;
};

const MODE_LABEL = {
  WALK: { en: "walking", es: "a pie" },
  DRIVE: { en: "driving", es: "en auto" },
  BICYCLE: { en: "cycling", es: "en bici" },
  TRANSIT: { en: "riding transit", es: "en transporte público" },
} as const;

function distanceLabel(metres: number): string {
  if (metres >= 1000) {
    const km = metres / 1000;
    if (Number.isInteger(km)) return `${km} km`;
    return `${km.toFixed(km < 10 ? 1 : 0)} km`;
  }
  return `${Math.round(metres)} m`;
}

/**
 * The answer for a successful route is built only from the provider result:
 * distance, duration (rounded to whole minutes), mode, caution and attribution.
 * The model is not allowed to add street names, turns, landmarks or a second
 * duration guess that Google did not return.
 */
function successMessage(route: GuardRoute, spanish: boolean): string {
  const distance = distanceLabel(route.distanceMeters);
  const minutes = Math.max(1, Math.round(route.durationSeconds / 60));
  const mode = MODE_LABEL[route.travelMode];
  const caution = route.warning
    ? spanish
      ? route.travelMode === "BICYCLE"
        ? " Las rutas en bici pueden omitir ciclovías; ten cuidado."
        : " Las rutas a pie pueden omitir aceras o senderos peatonales; ten cuidado."
      : ` ${route.warning}`
    : "";
  return spanish
    ? `Google Maps: ${distance}, unos ${minutes} minutos ${mode.es}.${caution}`
    : `Google Maps: ${distance}, about ${minutes} minutes ${mode.en}.${caution}`;
}

function recentUserIsSpanish(messageList: ProcessOutputStreamArgs["messageList"]): boolean {
  try {
    const recentUser = messageList?.get.all.db().filter((m) => m.role === "user").at(-1);
    const userText = recentUser?.content.parts
      ?.filter((p) => p.type === "text")
      .map((p) => p.text)
      .join(" ") ?? "";
    return /[¿¡]|\b(cu[aá]nto|cu[aá]l|desde|entre|ruta|caminar|caminando|andando|a pie)\b/i.test(userText);
  } catch {
    return false;
  }
}

/**
 * SAN-465: a genuine compute-route result is required for distance/ETA claims.
 * Gemini has been observed estimating "5–10 minutes" even after a null result,
 * and adding unsupported street names after a real one. Replace the route turn's
 * text at the existing Mastra output boundary, before CopilotKit/AG-UI or memory
 * can display/persist anything the provider did not return.
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
  "lookupPublicDiscoveryItemTool",
  "lookup-public-discovery-item",
  "readBrokerWorkspace",
  "readBrokerWorkspaceTool",
  "read-broker-workspace",
  "searchNewProjectsTool",
  "compareNewProjectsTool",
  "searchWebGroundedEventsTool",
  "requestVenueBooking",
  "request-venue-booking",
]);

export const routeUnavailableOutputGuard = {
  id: "san465-route-unavailable-output",
  async processOutputStream({ part, state, messageList }: ProcessOutputStreamArgs) {
    if (part.type === "tool-result") {
      if (part.payload.toolName !== "computeRouteTool" &&
          part.payload.toolName !== "compute-route") {
        // Only a separate user-facing result may clear the route guard.
        // Memory/bookkeeping tools must not re-enable an unverified answer.
        if (SEPARATE_ANSWER_TOOLS.has(part.payload.toolName)) {
          state.routeUnavailable = false;
          state.routeUnavailableEmitted = false;
          state.routeFailureReason = undefined;
          state.routeResults = [];
          state.routeResultEmitted = false;
        }
        return part;
      }
      const result = part.payload.result;
      if (result && typeof result === "object" && "route" in result) {
        if (result.route === null) {
          // A later failure must not erase a route that already succeeded.
          const existing = Array.isArray(state.routeResults) ? state.routeResults : [];
          if (existing.length === 0) {
            state.routeUnavailable = true;
            state.routeUnavailableEmitted = false;
            state.routeFailureReason = "reason" in result ? result.reason : undefined;
          }
          state.routeResultEmitted = false;
        } else {
          const existing = Array.isArray(state.routeResults)
            ? (state.routeResults as GuardRoute[])
            : [];
          // One turn may contain more than one real route (e.g. two selected
          // origins). Keep every distinct provider result, but do not repeat the
          // same route when the model calls the tool twice for one question.
          const incoming = result.route as GuardRoute;
          const duplicate = existing.some((route) =>
            route.distanceMeters === incoming.distanceMeters &&
            route.durationSeconds === incoming.durationSeconds &&
            route.travelMode === incoming.travelMode,
          );
          state.routeResults = duplicate ? existing : [...existing, incoming];
          state.routeUnavailable = false;
          state.routeUnavailableEmitted = false;
          state.routeFailureReason = undefined;
          state.routeResultEmitted = false;
        }
      }
      return part;
    }

    if (part.type !== "text-delta") {
      return part;
    }

    // ponytail: a multi-route turn currently has no per-route place labels, and a
    // mixed success/failure turn only reports the successful routes. Both need
    // the plan's display names in the tool result and a richer card (SAN-229);
    // the primary one-route journey is complete. Upgrade path: return
    // origin/destination labels from compute-route and emit one labeled line per
    // result, including failures.
    const routes = Array.isArray(state.routeResults) ? (state.routeResults as GuardRoute[]) : [];

    if (routes.length > 0) {
      if (state.routeResultEmitted === true) {
        // ponytail: a successful route replaces the route-only reply. A compound
        // question that needs route facts *and* prose must call another
        // user-facing tool (which clears this guard); splitting arbitrary prose
        // into route vs non-route claims needs claim-level parsing. Upgrade path:
        // emit one sentence per route and preserve non-route paragraphs with the
        // SAN-229 commute card.
        return null;
      }
      state.routeResultEmitted = true;
      const spanish = recentUserIsSpanish(messageList);
      return {
        ...part,
        payload: {
          ...part.payload,
          text: routes.map((route) => successMessage(route, spanish)).join("\n\n"),
        },
      };
    }

    if (state.routeUnavailable === true) {
      if (state.routeUnavailableEmitted === true) {
        // Drop *all* subsequent model-generated text for the failed route.
        return null;
      }
      state.routeUnavailableEmitted = true;
      return {
        ...part,
        payload: {
          ...part.payload,
          text: failureMessage(state.routeFailureReason, recentUserIsSpanish(messageList)),
        },
      };
    }

    return part;
  },
} satisfies Processor;
