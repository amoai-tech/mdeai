import { z } from "zod";

const TEXT = (min: number, max: number) =>
  z.string().trim().min(min).max(max);

/**
 * SAN-814 — fields a signed-in partner may edit on their own business profile.
 * All fields are optional so PATCH is a partial update; at least one must be
 * present. Values live in the existing partners.settings JSONB.
 */
export const partnerProfileUpdateSchema = z
  .object({
    businessName: TEXT(2, 160).optional(),
    category: TEXT(2, 80).optional(),
    neighborhood: TEXT(2, 80).optional(),
    description: z.string().trim().max(1000).optional(),
    website: z
      .string()
      .trim()
      .max(300)
      .refine(
        (value) => value === "" || /^https?:\/\/[^\s]+$/i.test(value),
        "Enter a valid http(s) URL",
      )
      .optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "No profile fields to update",
  );

export type PartnerProfileUpdate = z.infer<typeof partnerProfileUpdateSchema>;

export const PARTNER_PROFILE_FIELDS = [
  "businessName",
  "category",
  "neighborhood",
  "description",
  "website",
] as const;

export type PartnerProfileField = (typeof PARTNER_PROFILE_FIELDS)[number];
