import type { Processor, ProcessOutputStreamArgs } from "@mastra/core/processors";

/**
 * SAN-465: a genuine compute-route result is required for distance/ETA claims.
 * Gemini has been observed estimating "5–10 minutes" even after a null result.
 * Replace only that failed route turn's text, at the existing Mastra output
 * boundary, before CopilotKit/AG-UI or memory can display/persist the guess.
 */
export const routeUnavailableOutputGuard = {
  id: "san465-route-unavailable-output",
  async processOutputStream({ part, state, messageList }: ProcessOutputStreamArgs) {
    if (part.type === "tool-result" && (
      part.payload.toolName === "computeRouteTool" || part.payload.toolName === "compute-route"
    )) {
      const result = part.payload.result;
      if (result && typeof result === "object" && "route" in result) {
        state.routeUnavailable = result.route === null;
        state.routeUnavailableEmitted = false;
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
    const answer = spanish
      ? "Google Maps no pudo calcular esta ruta. No tengo una distancia ni un tiempo de viaje verificados, así que no voy a inventarlos."
      : "Google Maps could not calculate this route. I don't have a verified distance or travel time, so I won't guess.";

    return { ...part, payload: { ...part.payload, text: answer } };
  },
} satisfies Processor;
