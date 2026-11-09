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
  TRANSIT: { en: "by transit", es: "en transporte público" },
} as const;

function distanceLabel(metres: number): string {
  if (metres >= 1000) {
    const km = metres / 1000;
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
    return /[¿¡]|\b(cu[aá]nto|cu[aá]l|desde|entre|ruta|caminar|caminando)\b/i.test(userText);
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
          state.routeResult = undefined;
          state.routeResultEmitted = false;
        }
        return part;
      }
      const result = part.payload.result;
      if (result && typeof result === "object" && "route" in result) {
        if (result.route === null) {
          state.routeUnavailable = true;
          state.routeUnavailableEmitted = false;
          state.routeFailureReason = "reason" in result ? result.reason : undefined;
          state.routeResult = undefined;
          state.routeResultEmitted = false;
        } else {
          state.routeUnavailable = false;
          state.routeUnavailableEmitted = false;
          state.routeFailureReason = undefined;
          state.routeResult = result.route;
          state.routeResultEmitted = false;
        }
      }
      return part;
    }

    if (part.type !== "text-delta") {
      return part;
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

    const route = state.routeResult as GuardRoute | undefined;
    if (!route) {
      return part;
    }
    if (state.routeResultEmitted === true) {
      // The canonical provider-backed answer is already emitted.
      return null;
    }
    state.routeResultEmitted = true;
    return {
      ...part,
      payload: {
        ...part.payload,
        text: successMessage(route, recentUserIsSpanish(messageList)),
      },
    };
  },
} satisfies Processor;
