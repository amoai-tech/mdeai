import { z } from "zod";

import { PARTNER_TYPES } from "@/lib/partners/partner-types";

export const CONTACT_PARTNER_TYPES = ["general", ...PARTNER_TYPES] as const;
export type ContactPartnerType = (typeof CONTACT_PARTNER_TYPES)[number];

export const contactLeadSchema = z.object({
  requestId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  partnerType: z.enum(CONTACT_PARTNER_TYPES),
  businessName: z.string().trim().max(160).optional(),
  message: z.string().trim().min(10).max(2000),
});

export type ContactLeadInput = z.infer<typeof contactLeadSchema>;
