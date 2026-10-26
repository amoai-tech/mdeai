import { createTool } from "@mastra/core/tools";
import type { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";

import { getPartnerRuntimeContext } from "../lib/partner-request-context";

const profileSchema = z.object({
  found: z.boolean(),
  businessName: z.string().nullable(),
  category: z.string().nullable(),
  neighborhood: z.string().nullable(),
  website: z.string().nullable(),
  description: z.string().nullable(),
  missing: z.array(z.string()),
  message: z.string(),
});

/**
 * SAN-705 — read-only partner profile tool.
 *
 * The runtime derives the selected partner from the signed-in user and stores it
 * in RequestContext. This tool never reads a partner id from model input and has
 * no write path.
 */
export const getPartnerProfileTool = createTool({
  id: "get-partner-profile",
  description:
    "Read the signed-in partner's OWN saved business profile and list missing fields. Use when the partner asks what is missing or what MDE currently knows about their business. Never use it for another business.",
  inputSchema: z.object({}),
  outputSchema: profileSchema,
  execute: async (_input: unknown, context?: unknown) => {
    const requestContext = (
      context as { requestContext?: RequestContext } | undefined
    )?.requestContext;
    const partner = requestContext
      ? getPartnerRuntimeContext(requestContext)
      : null;

    if (!partner) {
      return {
        found: false,
        businessName: null,
        category: null,
        neighborhood: null,
        website: null,
        description: null,
        missing: [],
        message:
          "No authorized partner profile is selected. Ask the partner to choose a business from their profile page.",
      };
    }

    const fields = {
      businessName: partner.businessName,
      category: partner.category,
      neighborhood: partner.neighborhood,
      website: partner.website,
      description: partner.description,
    };
    const missing = Object.entries(fields)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    return {
      found: true,
      ...fields,
      missing,
      message: missing.length
        ? `The saved profile is missing: ${missing.join(", ")}. Edit them on /partners/profile.`
        : "The saved profile has all five reviewed fields.",
    };
  },
});
