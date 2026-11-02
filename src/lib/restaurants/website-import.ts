import { z } from "zod";

import { readPublicWebsite, PublicWebsiteReadError } from "@/lib/web/safe-public-page-reader";
import { extractWebsiteJson } from "@/lib/web/extract-website-json";
import { openingHoursSchema } from "@/lib/restaurants/restaurant-owner-schema";
import { normalizePublicRestaurantUrl } from "@/lib/restaurants/public-website-url";

/**
 * SAN-1542 — sourced website import for the existing restaurant editor.
 *
 * This is a *proposal* engine, never a writer. It reads one public page through
 * Gemini URL Context, keeps only the fields the page actually states, and returns
 * the successful retrieval URLs as evidence. The operator reviews the suggestion
 * in the same form and saves it through `restaurant_owner_patch`.
 *
 * Failure is recoverable: an invalid URL, timeout or unusable page returns an
 * error the editor shows; nothing is written and unknown fields stay unchanged.
 */

const HTTP_URL = /^https?:\/\/\S+$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const restaurantWebsiteDraftSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    description: optionalText(2000),
    website: z
      .string()
      .trim()
      .max(300)
      .refine((value) => HTTP_URL.test(value), "Enter a valid http(s) URL")
      .optional(),
    phone: optionalText(40),
    email: z.string().trim().email().max(160).optional(),
    address: optionalText(240),
    neighborhood: optionalText(120),
    city: optionalText(120),
    price_level: z.number().int().min(1).max(4).optional(),
    hours_of_operation: openingHoursSchema.optional(),
    cuisine_types: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
    unknownFields: z.array(z.string().trim().max(40)).max(10).default([]),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.website !== undefined ||
      value.phone !== undefined ||
      value.email !== undefined ||
      value.address !== undefined ||
      value.neighborhood !== undefined ||
      value.city !== undefined ||
      value.price_level !== undefined ||
      value.hours_of_operation !== undefined ||
      value.cuisine_types !== undefined,
    "No listing details found on that page",
  );

export type RestaurantWebsiteDraft = z.infer<typeof restaurantWebsiteDraftSchema> & {
  /** Final URLs actually retrieved by the guarded public-page reader. */
  sources: string[];
  retrievedAt: string;
};

export type RestaurantWebsiteImportCode =
  | "invalid_url"
  | "provider_unavailable"
  | "provider_failed"
  | "invalid_output"
  | "timeout";

export class RestaurantWebsiteImportError extends Error {
  constructor(
    readonly code: RestaurantWebsiteImportCode,
    message: string,
  ) {
    super(message);
    this.name = "RestaurantWebsiteImportError";
  }
}

/** Parse the first JSON object from model text; trims fences and prose. */
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

/**
 * Drop values the model returned as null/blank so an unknown fact is never
 * presented as a real one. Arrays that end up empty are dropped too.
 */
export function cleanDraftValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (Array.isArray(value)) {
    const kept = value
      .map((entry) => cleanDraftValue(entry))
      .filter((entry) => entry !== undefined);
    return kept.length > 0 ? kept : undefined;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, cleanDraftValue(entry)] as const)
      .filter(([, entry]) => entry !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

export async function extractRestaurantWebsiteDraft(
  rawUrl: string,
): Promise<RestaurantWebsiteDraft> {
  const url = normalizePublicRestaurantUrl(rawUrl);
  if (!url) throw new RestaurantWebsiteImportError(
    "invalid_url", "Enter a public http(s) website address (local and private hosts are not allowed).",
  );

  let page;
  try {
    page = await readPublicWebsite(url);
  } catch (error) {
    if (error instanceof PublicWebsiteReadError) {
      throw new RestaurantWebsiteImportError(
        error.code === "timeout" ? "timeout" :
          error.code === "unsafe_url" ? "invalid_url" : "provider_failed",
        error.message,
      );
    }
    throw error;
  }

  let modelObject: unknown;
  try {
    modelObject = await extractWebsiteJson(page, "restaurant",
      "name, description, phone, email, address, neighborhood, city, price_level (1-4), " +
      "cuisine_types (array), hours_of_operation (monday..sunday {open,close}), unknownFields (array).");
  } catch (error) {
    const isTimeout = error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new RestaurantWebsiteImportError(
      isTimeout ? "timeout" : "provider_failed",
      "Could not analyze that website. Try again or enter the details manually.",
    );
  }

  // Never allow an LLM to claim which URLs were actually fetched.
  const facts = cleanDraftValue(modelObject);
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) {
    throw new RestaurantWebsiteImportError("invalid_output", "No usable restaurant details found.");
  }
  const fields: Record<string, unknown> = { ...facts as Record<string, unknown> };
  delete fields.sources;
  delete fields.website;
  // Do not treat the source URL alone as evidence of restaurant facts.
  if (!["name", "description", "phone", "email", "address", "neighborhood", "city",
    "price_level", "cuisine_types", "hours_of_operation"].some((key) => fields[key] !== undefined)) {
    throw new RestaurantWebsiteImportError("invalid_output", "No supported restaurant facts found.");
  }
  const parsed = restaurantWebsiteDraftSchema.safeParse({
    ...fields,
    website: page.finalUrl,
  });
  if (!parsed.success) {
    throw new RestaurantWebsiteImportError("invalid_output", "No usable restaurant details were found on that page.");
  }
  return { ...parsed.data, sources: [page.finalUrl], retrievedAt: page.retrievedAt };
}

// Kept local so a malformed model time string is rejected the same way the form rejects it.
export const WEBSITE_IMPORT_TIME_PATTERN = TIME;
