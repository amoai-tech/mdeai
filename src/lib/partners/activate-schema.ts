import { z } from "zod";
import { PARTNER_TYPES } from "@/lib/partners/partner-types";

const BLOCKED_PARTNER_SETTING_KEYS = new Set([
  "status",
  "tier",
  "completion_score",
  "activated_at",
  "__proto__",
  "constructor",
  "prototype",
]);

const ALLOWED_PARTNER_SIGNUP_SETTING_KEYS = new Set([
  "businessName",
  "category",
  "neighborhood",
  "website",
  "description",
]);

const PARTNER_SETTING_MAX_LENGTH: Record<string, number> = {
  businessName: 160,
  category: 80,
  neighborhood: 80,
  website: 300,
  description: 1000,
};

export function assertAllowedSignupSettings(
  settings: Record<string, unknown> | undefined,
): void {
  if (!settings) return;
  for (const key of Object.keys(settings)) {
    if (BLOCKED_PARTNER_SETTING_KEYS.has(key.toLowerCase())) {
      throw new Error(`Privileged setting key blocked: ${key}`);
    }
    if (!ALLOWED_PARTNER_SIGNUP_SETTING_KEYS.has(key)) {
      throw new Error(`Disallowed setting key: ${key}`);
    }
  }
}

export function sanitizePartnerSettings(
  settings: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!settings) return Object.create(null) as Record<string, unknown>;
  const out = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries(settings)) {
    if (BLOCKED_PARTNER_SETTING_KEYS.has(key.toLowerCase())) continue;
    if (!ALLOWED_PARTNER_SIGNUP_SETTING_KEYS.has(key)) continue;
    if (typeof value !== "string") continue;
    const max = PARTNER_SETTING_MAX_LENGTH[key] ?? 300;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (key === "website" && !/^https?:\/\/[^\s]+$/i.test(trimmed)) continue;
    out[key] = trimmed.slice(0, max);
  }
  return out;
}

export const activatePartnerInputSchema = z
  .object({
    type: z.enum(PARTNER_TYPES),
    draftId: z.string().uuid().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .transform((data) => ({
    ...data,
    settings: sanitizePartnerSettings(data.settings),
  }));

/** Pre-transform input — `settings` optional for callers and unit tests. */
export type ActivatePartnerInput = z.input<typeof activatePartnerInputSchema>;
