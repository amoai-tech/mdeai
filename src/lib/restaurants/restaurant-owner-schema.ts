import { z } from "zod";

/**
 * SAN-1540/1541 — the only fields an authorized restaurant partner may edit.
 *
 * Database column names are used deliberately: the form, the PATCH body and the
 * `restaurant_owner_patch` RPC all speak the same shape, so a field can never be
 * silently dropped by a camel/snake translation layer.
 *
 * Protected fields (partner_id, is_active, is_verified, rating, google_place_id,
 * source, created_by) are not present here and are rejected by `.strict()`.
 */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const HTTP_URL = /^https?:\/\/\S+$/i;

export const HOURS_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type HoursDay = (typeof HOURS_DAYS)[number];

export const hoursDaySchema = z
  .object({ open: z.string().regex(TIME, "Use HH:MM"), close: z.string().regex(TIME, "Use HH:MM") })
  .strict();

export type HoursDayValue = z.infer<typeof hoursDaySchema>;

export const openingHoursSchema = z
  .object({
    monday: hoursDaySchema.optional(),
    tuesday: hoursDaySchema.optional(),
    wednesday: hoursDaySchema.optional(),
    thursday: hoursDaySchema.optional(),
    friday: hoursDaySchema.optional(),
    saturday: hoursDaySchema.optional(),
    sunday: hoursDaySchema.optional(),
  })
  .strict();

export type OpeningHours = z.infer<typeof openingHoursSchema>;

export const listingImageSchema = z
  .object({
    url: z.string().trim().max(1000).regex(HTTP_URL, "Enter a valid http(s) image URL"),
    source: z.string().trim().max(120).optional(),
    sourceUrl: z
      .union([z.literal(""), z.string().trim().max(300).regex(HTTP_URL, "Enter a valid http(s) source URL")])
      .optional(),
    alt: z.string().trim().max(240).optional(),
  })
  .strict();

export type ListingImage = z.infer<typeof listingImageSchema>;

const optionalText = (max: number) => z.string().trim().max(max).optional();

const optionalUrl = (max: number) =>
  z
    .union([z.literal(""), z.string().trim().max(max).regex(HTTP_URL, "Enter a valid http(s) URL")])
    .optional();

const optionalEmail = z.union([z.literal(""), z.string().trim().email().max(160)]).optional();

const optionalList = z.array(z.string().trim().min(1).max(60)).max(20).optional();

/** A partial update: only fields the operator actually changed are sent. */
export const restaurantListingPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    description: optionalText(2000),
    website: optionalUrl(300),
    phone: optionalText(40),
    email: optionalEmail,
    address: optionalText(240),
    neighborhood: optionalText(120),
    city: optionalText(120),
    postal_code: optionalText(20),
    hours_of_operation: openingHoursSchema.nullable().optional(),
    price_level: z.number().int().min(1).max(4).nullable().optional(),
    cuisine_types: optionalList,
    dietary_options: optionalList,
    ambiance: optionalList,
    tags: optionalList,
    images: z.array(listingImageSchema).max(20).optional(),
    primary_image_url: optionalUrl(1000),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Choose at least one field to save");

export type RestaurantListingPatch = z.infer<typeof restaurantListingPatchSchema>;

export type RestaurantListingValues = {
  name: string;
  description: string;
  website: string;
  phone: string;
  email: string;
  address: string;
  neighborhood: string;
  city: string;
  postal_code: string;
  hours_of_operation: OpeningHours;
  price_level: number | null;
  cuisine_types: string[];
  dietary_options: string[];
  ambiance: string[];
  tags: string[];
  images: ListingImage[];
  primary_image_url: string;
};

const TEXT_FIELDS = [
  "name",
  "description",
  "website",
  "phone",
  "email",
  "address",
  "neighborhood",
  "city",
  "postal_code",
  "primary_image_url",
] as const;

/** Normalize an unknown database row into safe form values (never invents facts). */
export function listingValuesFromRecord(record: {
  name?: string | null;
  description?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  postal_code?: string | null;
  hours_of_operation?: unknown;
  price_level?: number | null;
  cuisine_types?: string[] | null;
  dietary_options?: string[] | null;
  ambiance?: string[] | null;
  tags?: string[] | null;
  images?: unknown;
  primary_image_url?: string | null;
}): RestaurantListingValues {
  const hours = openingHoursSchema.safeParse(record.hours_of_operation ?? {});
  const images = z.array(listingImageSchema).safeParse(record.images ?? []);
  const price = record.price_level;
  return {
    name: record.name ?? "",
    description: record.description ?? "",
    website: record.website ?? "",
    phone: record.phone ?? "",
    email: record.email ?? "",
    address: record.address ?? "",
    neighborhood: record.neighborhood ?? "",
    city: record.city ?? "",
    postal_code: record.postal_code ?? "",
    hours_of_operation: hours.success ? hours.data : {},
    price_level: typeof price === "number" && price >= 1 && price <= 4 ? price : null,
    cuisine_types: record.cuisine_types ?? [],
    dietary_options: record.dietary_options ?? [],
    ambiance: record.ambiance ?? [],
    tags: record.tags ?? [],
    images: images.success ? images.data : [],
    primary_image_url: record.primary_image_url ?? "",
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Only send edited fields, so a stale tab never overwrites a newer change and an
 * unknown value is never replaced with an empty string.
 */
export function buildRestaurantListingPatch(
  current: RestaurantListingValues,
  saved: RestaurantListingValues,
): RestaurantListingPatch {
  const patch: Record<string, unknown> = {};

  for (const field of TEXT_FIELDS) {
    const value = current[field].trim();
    const previous = saved[field].trim();
    if (value !== previous) patch[field] = value;
  }

  if (current.price_level !== saved.price_level) {
    patch.price_level = current.price_level;
  }
  if (!sameJson(current.hours_of_operation, saved.hours_of_operation)) {
    const days = Object.keys(current.hours_of_operation);
    patch.hours_of_operation = days.length > 0 ? current.hours_of_operation : null;
  }
  for (const field of ["cuisine_types", "dietary_options", "ambiance", "tags"] as const) {
    if (!sameJson(current[field], saved[field])) {
      patch[field] = current[field].map((value) => value.trim()).filter(Boolean);
    }
  }
  if (!sameJson(current.images, saved.images)) {
    patch.images = current.images;
  }

  return patch as RestaurantListingPatch;
}

/** Split a comma-separated input into a trimmed, de-duplicated list. */
export function parseListInput(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}
