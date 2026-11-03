import type { Rental } from "@/mastra/tools/search-rentals";

/**
 * SAN-1504 — turn one rental result row from the chat envelope into the full `Rental` the details
 * panel renders, or `null`.
 *
 * The rental search tool validates its output against `rentalSchema` before it reaches the chat, so a
 * real row always passes. This is the browser-side check of that same shape (the schema itself lives
 * in a server module the browser must not import). It refuses a row instead of filling a gap: a
 * missing price, photo or source is never invented, and the caller falls back to the old reduced
 * sheet. Nothing here fetches anything.
 */

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);

/** Required by `rentalSchema`: field name → type check. */
const REQUIRED: Record<string, (value: unknown) => boolean> = {
  id: isString,
  title: isString,
  neighborhood: isString,
  nightly_price: isNumber,
  currency: isString,
  bedrooms: isNumber,
  wifi: isBoolean,
  amenities: isStringArray,
  image: isString,
  source_url: isString,
  can_schedule_viewing: isBoolean,
  schedule_viewing_url: (value) => value === null || isString(value),
  host_name: isString,
  availability: isString,
  tags: isStringArray,
};

/** Optional in `rentalSchema`: absent is fine, present must have the right type. */
const OPTIONAL: Record<string, (value: unknown) => boolean> = {
  bedrooms_unknown: isBoolean,
  images: isStringArray,
  photo_count: isNumber,
  source_provider: isString,
  latitude: isNumber,
  longitude: isNumber,
  price_monthly: isNumber,
};

export function toDetailRental(row: unknown): Rental | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  for (const [key, check] of Object.entries(REQUIRED)) {
    if (!check(record[key])) return null;
  }
  for (const [key, check] of Object.entries(OPTIONAL)) {
    if (record[key] !== undefined && !check(record[key])) return null;
  }
  return row as Rental;
}
