import { z } from "zod";

/**
 * SAN-709 — the only shape an AI profile suggestion may take.
 * Unknown keys are rejected so a model cannot smuggle privileged partner data.
 * Every field is optional, but at least one real field must be present.
 */
export const partnerProfileSuggestionSchema = z
  .object({
    businessName: z.string().trim().min(2).max(160).optional(),
    category: z.string().trim().min(2).max(80).optional(),
    neighborhood: z.string().trim().min(2).max(80).optional(),
    website: z
      .string()
      .trim()
      .max(300)
      .refine(
        (value) => value === "" || /^https?:\/\/[^\s]+$/i.test(value),
        "Enter a valid http(s) URL",
      )
      .optional(),
    description: z.string().trim().max(1000).optional(),
    reason: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.businessName !== undefined ||
      value.category !== undefined ||
      value.neighborhood !== undefined ||
      value.website !== undefined ||
      value.description !== undefined,
    "Suggestion contained no profile fields",
  );

export type PartnerProfileSuggestion = z.infer<
  typeof partnerProfileSuggestionSchema
>;

/** Parse untrusted model output. Returns null instead of throwing. */
export function parsePartnerProfileSuggestion(
  value: unknown,
): PartnerProfileSuggestion | null {
  const parsed = partnerProfileSuggestionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Merge only the fields the user accepted; does not write to Supabase. */
export function applySuggestionToForm<T extends Record<string, unknown>>(
  form: T,
  suggestion: PartnerProfileSuggestion,
): T {
  return {
    ...form,
    ...(suggestion.businessName !== undefined
      ? { businessName: suggestion.businessName }
      : {}),
    ...(suggestion.category !== undefined ? { category: suggestion.category } : {}),
    ...(suggestion.neighborhood !== undefined
      ? { neighborhood: suggestion.neighborhood }
      : {}),
    ...(suggestion.website !== undefined ? { website: suggestion.website } : {}),
    ...(suggestion.description !== undefined
      ? { description: suggestion.description }
      : {}),
  };
}
