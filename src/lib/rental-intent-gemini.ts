/**
 * GEM-RE-002 — structured rental intent (escalation path; regex remains default).
 *
 * SAN-1588: the model is the one selected by `MDE_AI_PROVIDER` (Gemini by
 * default, NVIDIA Nemotron when configured). The schema, prompt and regex
 * fallback are unchanged, so switching provider cannot change search semantics.
 *
 * NVIDIA is a reasoning model; `structuredOutputProviderOptions()` disables its
 * thinking budget for this call. Live testing showed the default budget can spend
 * the whole output allowance on reasoning and return truncated JSON.
 */
import { generateObject } from "ai";
import {
  createActiveLanguageModel,
  STRUCTURED_OUTPUT_MAX_TOKENS,
  structuredOutputProviderOptions,
} from "@/lib/ai-provider";
import {
  rentalIntentSchema,
  type RentalIntent,
} from "@/lib/rental-intent-schema";

const rentalIntentObjectSchema = rentalIntentSchema;

const RENTAL_INTENT_PROMPT = `Extract Medellín furnished rental search slots from the user message.
Return only structured slots — never invent listings, prices from listings, or availability.
If the query is not a rental search, set action to "skip" and confidence below 0.5.
Phase 1 UI is English; Spanish queries may still yield slots but action may be clarify.`;

export const parseRentalIntentWithGemini = async (
  text: string,
  options?: { signal?: AbortSignal },
): Promise<RentalIntent | null> => {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const { object } = await generateObject({
    model: createActiveLanguageModel(),
    schema: rentalIntentObjectSchema,
    prompt: `${RENTAL_INTENT_PROMPT}\n\nUser message: ${trimmed}`,
    abortSignal: options?.signal,
    providerOptions: structuredOutputProviderOptions(),
    maxOutputTokens: STRUCTURED_OUTPUT_MAX_TOKENS,
  });

  return rentalIntentSchema.parse(object);
};

/** Renter-facing alias; the implementing provider depends on configuration. */
export const parseRentalIntentWithActiveModel = parseRentalIntentWithGemini;

/** Slots compared for regex/model parity — null-normalized, stable order. */
const SLOT_KEYS = [
  "neighborhood",
  "minBedrooms",
  "maxPricePerNight",
  "stayType",
  "checkIn",
  "checkOut",
] as const;

/** Normalize model + regex intents to comparable search slots (tests). */
export const rentalIntentSlotsKey = (intent: RentalIntent): string =>
  JSON.stringify(
    Object.fromEntries(SLOT_KEYS.map((key) => [key, intent[key] ?? null])),
  );
