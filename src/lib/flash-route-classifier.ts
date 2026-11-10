/**
 * SAN-872 · INT-023-A — Gemini Flash structured router for ambiguous concierge prompts.
 * Runs only when FLASH_ROUTE=1 and regex confidence is in the ambiguous band (or low-confidence venue collision).
 *
 * SAN-1588: this path stays on Gemini even when `MDE_AI_PROVIDER=nvidia`.
 * Nemotron 3.5 Super VL is a reasoning model; live structured calls measured
 * 0.6 s at best and up to 69 s / a multi-minute hang across runs, against this
 * classifier's 800 ms ceiling. Routing it here would abort nearly every
 * ambiguous turn and fall back to regex anyway, so the honest behavior is to
 * skip the call.
 */
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { GEMINI_FLASH_MODEL_ID, parseAiProvider } from "@/lib/ai-model-ids";
import { isExactMonthlyBudgetOnlyRefinement, isWholeCityReply, looksLikeRentalSearch } from "@/lib/rental-query-parser";
// Uses the raw Gemini model (not the COST-001-wrapped FLASH_MODEL): this module
// is reachable from the client chat bundle, and the wrapped model pulls in the
// server-only node:async_hooks token sink. Same model *id* via
// `@/lib/ai-model-ids` (which has no imports, so it is safe here); the
// classifier is a separate, FLASH_ROUTE-gated call whose tokens are not
// turn-attributed.
const FLASH_MODEL = google(GEMINI_FLASH_MODEL_ID);
import {
  classifyRouterIntent,
  routerConfidenceToAction,
  routerIntentSchema,
  type RouterAction,
  type RouterIntent,
  type RouterIntentClassification,
  type RouterRoutingTarget,
} from "@/lib/router-intent";

export const FLASH_ROUTE_TIMEOUT_MS = 800;
export const FLASH_AMBIGUOUS_MIN = 0.5;
export const FLASH_HIGH_CONFIDENCE = 0.85;
export const FLASH_MERGE_MIN = 0.65;

export const flashRouteSlotsSchema = z.object({
  neighborhood: z.string().optional(),
  partySize: z.number().int().positive().optional(),
  eventType: z.string().optional(),
  budget: z.string().optional(),
  venueName: z.string().optional(),
});

export const flashRouteResultSchema = z.object({
  intent: routerIntentSchema,
  confidence: z.number().min(0).max(1),
  topicShift: z.boolean(),
  slots: flashRouteSlotsSchema,
});

export type FlashRouteSlots = z.infer<typeof flashRouteSlotsSchema>;
export type FlashRouteResult = z.infer<typeof flashRouteResultSchema>;

export type FlashRouteClassification = RouterIntentClassification & {
  topicShift?: boolean;
  /** Deterministic discovery switch; free-text reason is for diagnostics only. */
  explicitTopicShift?: "coworking";
  flashSlots?: FlashRouteSlots;
  source?: "regex" | "flash" | "merged";
};

const VENUE_COLLISION_RE =
  /\b(?:venue|venues|party|birthday|book\s+\w|suggest\s+venues?|private\s+event\s+space|somewhere\s+for|event\s+space|for\s+\d+\s*(?:people|guests)?)\b/i;

export function isFlashRouteEnabled(): boolean {
  return process.env.FLASH_ROUTE === "1";
}

export function shouldInvokeFlashClassifier(
  regex: RouterIntentClassification,
  text: string,
): boolean {
  if (!isFlashRouteEnabled()) return false;

  const confidence = regex.confidence;
  if (confidence >= FLASH_HIGH_CONFIDENCE) return false;

  if (confidence >= FLASH_AMBIGUOUS_MIN) return true;

  if (regex.routingTarget === "agent" && VENUE_COLLISION_RE.test(text.trim())) {
    return true;
  }

  return false;
}

function intentToRoutingTarget(intent: RouterIntent): RouterRoutingTarget {
  switch (intent) {
    case "rental_search":
      return "rental";
    case "venue_booking":
      return "event_venue_booking";
    case "event_discovery":
      return "event";
    case "restaurant_discovery":
      return "restaurant";
    case "day_trip_planning":
    case "general_concierge":
    case "chitchat":
    case "unknown":
      return "agent";
    default:
      return "agent";
  }
}

function buildFlashPrompt(text: string, lastIntent?: RouterIntent): string {
  const lines = [
    "You classify Medellín concierge chat messages into exactly one intent.",
    "Prefer venue_booking when the user wants to hire a private event space (birthday, wedding, corporate),",
    "suggest venues for a party, book a named venue for a guest count, or find somewhere for a celebration.",
    "Prefer event_discovery only for ticketed public events (salsa nights, concerts, festivals, what's on).",
    "Prefer restaurant_discovery for sit-down meals without private event hire.",
    "Prefer rental_search for apartments and short-term stays.",
    "",
    `User message: ${text.trim()}`,
  ];
  if (lastIntent) {
    lines.push(`Previous intent in thread: ${lastIntent}`);
    lines.push(
      "Set topicShift true when the new message clearly switches vertical (e.g. events → venue hire).",
    );
  }
  return lines.join("\n");
}

export async function classifyRouteWithFlash(
  text: string,
  options?: { lastIntent?: RouterIntent; signal?: AbortSignal },
): Promise<FlashRouteResult | null> {
  const trimmed = text.trim();
  if (!trimmed || !process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  // NVIDIA is selected for the agents, not for this 800 ms path (see header).
  if (parseAiProvider(process.env.MDE_AI_PROVIDER) === "nvidia") return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FLASH_ROUTE_TIMEOUT_MS);
  const signal = options?.signal ?? controller.signal;

  try {
    const { object } = await generateObject({
      model: FLASH_MODEL,
      schema: flashRouteResultSchema,
      abortSignal: signal,
      prompt: buildFlashPrompt(trimmed, options?.lastIntent),
    });
    return flashRouteResultSchema.parse(object);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function mergeRegexAndFlashClassification(
  regex: RouterIntentClassification,
  flash: FlashRouteResult,
): FlashRouteClassification {
  if (flash.confidence < FLASH_MERGE_MIN) {
    if (flash.intent === regex.intent) {
      return {
        ...regex,
        confidence: Math.max(regex.confidence, flash.confidence),
        topicShift: flash.topicShift,
        flashSlots: flash.slots,
        source: "merged",
      };
    }
    return { ...regex, source: "regex" };
  }

  const routingTarget = intentToRoutingTarget(flash.intent);
  const action: RouterAction =
    flash.intent === "venue_booking"
      ? "search_now"
      : routerConfidenceToAction(flash.confidence);

  if (
    routingTarget === "agent" &&
    regex.routingTarget !== "agent" &&
    flash.confidence < 0.8
  ) {
    return { ...regex, source: "regex" };
  }

  return {
    intent: flash.intent,
    confidence: flash.confidence,
    reason: `flash structured router (regex was ${regex.intent})`,
    action,
    routingTarget,
    topicShift: flash.topicShift,
    flashSlots: flash.slots,
    source: "flash",
  };
}

/**
 * Classify a chat message using the shared router. Route an unambiguous budget
 * refinement to rentals only when the current conversation is still about rentals;
 * otherwise keep its original intent (including a newer non-rental topic).
 */
export async function resolveRouterClassification(
  text: string,
  options?: { lastIntent?: RouterIntent; inRentalSearch?: boolean },
): Promise<FlashRouteClassification> {
  const regex = classifyRouterIntent(text);

  // Coworking is a Concierge-agent topic, but an explicit change from rentals.
  // Agent working memory may not update lastIntent during that answer. Mark
  // the switch at dispatch instead, without a separate intent engine.
  // "Apartments near coworking" is still a rental request.
  // Only an actual booking INSTRUCTION ("Book a coworking space") skips the
  // discovery topic shift. "Which spaces can I book?" is still discovery.
  // Let booking actions use the existing router/Flash/agent; never invent a booking.
  const coworkingBookingRequest =
    /^\s*(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:book|reserve|rent|hire)\b/i.test(text) ||
    /^\s*i\s+(?:want|need)\s+to\s+(?:book|reserve|rent|hire)\b/i.test(text);
  const coworkingSubject =
    /\b(?:co[-\s]?working|coworking|shared\s+(?:workspaces?|offices?))\b/i.test(text);
  // "Coworking spaces for rent" refers to workplaces, not apartment listings.
  // The generic rental regex detects "for rent", so recognize the coworking
  // subject explicitly without hijacking "apartments near coworking" queries.
  const coworkingForRent =
    /\b(?:co[-\s]?working|coworking|shared\s+(?:workspaces?|offices?))\s+(?:spaces?|desks?|offices?)?\s*for\s+rent\b/i.test(text) &&
    !/\b(?:apartments?|rentals?|flats?|condos?|homes?|houses?|airbnbs?|lodging|stays?)\b/i.test(text);
  if (coworkingSubject && !coworkingBookingRequest &&
      (coworkingForRent || (regex.routingTarget === "agent" && !looksLikeRentalSearch(text)))) {
    return {
      ...regex,
      intent: "general_concierge",
      action: "agent",
      routingTarget: "agent",
      reason: "explicit coworking discovery topic change",
      explicitTopicShift: "coworking",
      topicShift: true,
      source: "regex",
    };
  }

  // "Anywhere is fine" says nothing about rentals on its own, so the regex hands it to the
  // assistant, which anonymous visitors cannot reach. Right after a rental search it is the renter
  // widening that search: keep it on the rental fast path, which resets the neighborhood (SAN-407).
  // Only a plain whole-city reply qualifies, so "Is Medellín safe at night?" still goes to the assistant.
  const inRentalSearch = options?.inRentalSearch ?? options?.lastIntent === "rental_search";
  const wholeCityRefinement = isWholeCityReply(text);
  // The shared router runs before the rental handler. In a visible rental chat,
  // an explicit budget-only refinement is a search even without a repeated
  // "apartment" noun. Reuse the canonical rental predicate; it rejects gym,
  // coworking, café and event topic shifts before they reach the rental handler.
  const contextualBudgetRefinement =
    !wholeCityRefinement && isExactMonthlyBudgetOnlyRefinement(text);
  if (inRentalSearch && regex.routingTarget === "agent" &&
      (wholeCityRefinement || contextualBudgetRefinement)) {
    return {
      ...regex,
      intent: "rental_search",
      confidence: 0.7,
      reason: wholeCityRefinement
        ? "whole-city follow-up to a rental search"
        : "same-currency budget-only follow-up to a rental search",
      action: "search_now",
      routingTarget: "rental",
      source: "regex",
    };
  }

  if (!shouldInvokeFlashClassifier(regex, text)) {
    return { ...regex, source: "regex" };
  }

  const flash = await classifyRouteWithFlash(text, {
    lastIntent: options?.lastIntent,
  });
  if (!flash) {
    return { ...regex, source: "regex" };
  }

  return mergeRegexAndFlashClassification(regex, flash);
}
