import type { Database } from "@/lib/supabase/database.types";

export type PartnerType = Database["public"]["Enums"]["partner_type"];

export const PARTNER_TYPES = [
  "host",
  "venue",
  "broker",
  "sponsor",
  "agency",
  "vendor",
  "tour",
  "creator",
] as const satisfies readonly PartnerType[];

/**
 * Public self-signup partner types (the picker at /partners/signup).
 *
 * `developer` is a canonical DB partner type, but New Projects developers are
 * onboarded operationally through the authenticated host/developer workspace
 * (SAN-1382), so they are intentionally not part of the public signup picker.
 */
export type PartnerSignupType = (typeof PARTNER_TYPES)[number];

export const PARTNER_ACTIVATE_REDIRECT = "/dashboard" as const;
