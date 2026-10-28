import { z } from "zod";

import { readPublicWebsite, PublicWebsiteReadError } from "@/lib/web/safe-public-page-reader";
import { extractWebsiteJson } from "@/lib/web/extract-website-json";
import { normalizeBusinessUrl } from "@/lib/onboarding/business-url";

export const businessUrlDraftSchema = z
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
    sources: z.array(z.string().trim().max(300)).max(5).default([]),
    unknownFields: z.array(z.string().trim().max(40)).max(10).default([]),
  })
  .strict()
  .refine(
    (value) =>
      value.businessName !== undefined ||
      value.category !== undefined ||
      value.neighborhood !== undefined ||
      value.website !== undefined ||
      value.description !== undefined,
    "No business details found",
  );

export type BusinessUrlDraft = z.infer<typeof businessUrlDraftSchema>;

export class BusinessUrlExtractionError extends Error {
  constructor(
    readonly code: "invalid_output" | "provider_failed",
    message: string,
  ) {
    super(message);
    this.name = "BusinessUrlExtractionError";
  }
}

/** Parse the first JSON object from model text; trims markdown fences/prose. */
export function parseDraftJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Never accept model-provided source attribution or null/blank facts. */
function cleanFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const data = Object.fromEntries(Object.entries(value).filter(([key, field]) =>
    key !== "sources" && field != null && (typeof field !== "string" || field.trim().length > 0)
  ));
  return data;
}

/** One sourced proposal, never a database write. */
export async function extractBusinessDraft(rawUrl: string): Promise<BusinessUrlDraft> {
  const url = normalizeBusinessUrl(rawUrl);
  if (!url) throw new BusinessUrlExtractionError("provider_failed", "Enter a valid public website.");
  let page;
  try {
    page = await readPublicWebsite(url);
  } catch (error) {
    if (error instanceof PublicWebsiteReadError) {
      throw new BusinessUrlExtractionError("provider_failed", error.message);
    }
    throw error;
  }

  let proposed: unknown;
  try {
    proposed = await extractWebsiteJson(page, "partner",
      "businessName, category, neighborhood, description, website, unknownFields (array).");
  } catch {
    throw new BusinessUrlExtractionError("provider_failed", "Website analysis is unavailable. Enter the details manually.");
  }

  const facts = cleanFields(proposed);
  // A bare URL isn't evidence of any extracted business fact.
  if (!["businessName", "category", "neighborhood", "description"].some((field) =>
    typeof facts[field] === "string" && (facts[field] as string).trim().length >= 2
  )) throw new BusinessUrlExtractionError("invalid_output", "No supported business details found.");

  const parsed = businessUrlDraftSchema.safeParse({
    ...facts,
    // Only server-retrieved URLs are trusted; never accept model claims of retrieval.
    website: page.finalUrl,
    sources: [page.finalUrl],
  });
  if (!parsed.success) {
    throw new BusinessUrlExtractionError("invalid_output", "No usable business details found.");
  }
  return parsed.data;
}
