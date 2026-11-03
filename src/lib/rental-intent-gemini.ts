/**
 * GEM-RE-002 — structured rental intent (escalation path; regex remains default).
 *
 * SAN-1588: the model is the one selected by `MDE_AI_PROVIDER` (Gemini by
 * default, NVIDIA Lightning when configured). The schema and deterministic
 * fallback are unchanged; the prompt now preserves an exact monthly COP cap
 * instead of letting the model convert it to a nightly ceiling.
 *
 * Lightning uses `enable_thinking: false` for this structured call. Leaving the
 * default thinking budget on can spend the whole output allowance on reasoning
 * and return truncated JSON.
 */
import { generateObject } from "ai";
import {
  createActiveLanguageModel,
  STRUCTURED_OUTPUT_MAX_TOKENS,
  structuredOutputProviderOptions,
} from "@/lib/ai-provider";
import { buildRentalSearchParams } from "@/lib/rental-query-parser";
import {
  rentalIntentSchema,
  type RentalIntent,
} from "@/lib/rental-intent-schema";

const rentalIntentObjectSchema = rentalIntentSchema;

const RENTAL_INTENT_PROMPT = `Extract Medellín furnished rental search slots from the user message.
Return only structured slots — never invent listings, prices from listings, or availability.
When the user specifies an exact monthly cap in COP, return maxPriceMonthly as the original amount, budgetCurrency "COP", stayType "monthly", and omit maxPricePerNight. Never convert monthly to nightly. For nightly USD, use maxPricePerNight and budgetCurrency "USD".
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

  // Exact user-stated monthly budgets are already parsed by the canonical
  // deterministic rental parser. Do not let an LLM silently drop or turn a COP
  // monthly cap into a guessed nightly ceiling (SAN-1588).
  const exact = buildRentalSearchParams(trimmed, {});
  if (exact?.maxPriceMonthly != null) {
    return rentalIntentSchema.parse({
      ...object,
      maxPriceMonthly: exact.maxPriceMonthly,
      budgetCurrency: exact.budgetCurrency,
      stayType: "monthly",
      maxPricePerNight: undefined,
    });
  }
  return rentalIntentSchema.parse(object);
};

/** Renter-facing alias; the implementing provider depends on configuration. */
export const parseRentalIntentWithActiveModel = parseRentalIntentWithGemini;

/** Slots compared for regex/model parity — null-normalized, stable order. */
const SLOT_KEYS = [
  "neighborhood",
  "minBedrooms",
  "maxPricePerNight",
  "maxPriceMonthly",
  "budgetCurrency",
  "stayType",
  "checkIn",
  "checkOut",
] as const;

/** Normalize model + regex intents to comparable search slots (tests). */
export const rentalIntentSlotsKey = (intent: RentalIntent): string =>
  JSON.stringify(
    Object.fromEntries(SLOT_KEYS.map((key) => [key, intent[key] ?? null])),
  );
