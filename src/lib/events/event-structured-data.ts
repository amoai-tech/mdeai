import type { PublicEventDetail } from "./types";

/**
 * schema.org Event JSON-LD built only from facts the database already stores.
 *
 * Deliberately absent:
 * - `organizer` — the host snapshot is a denormalized display record, not a confirmed
 *   organizer relationship, so naming one here would be an invented claim.
 * - `eventAttendanceMode` / `eventStatus` — neither is stored.
 * - `availability` on offers — no truthful stock claim is made.
 * - `description` — not part of the fact set this file is scoped to.
 *
 * The absence rules that matter most: no `offers` object at all when the event has no saved
 * active ticket tiers (never `price: 0` or `availability: InStock` as a stand-in), no
 * `location` when no venue/address was saved, and no `image` when no stored image exists.
 */

export type EventStructuredData = Record<string, unknown> & {
  "@context": "https://schema.org";
  "@type": "Event";
};

export type BuildEventStructuredDataOptions = {
  /** Absolute site origin used to resolve a relative stored image path. */
  siteOrigin?: string | null;
};

function parseStoredDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Only an absolute http(s) URL is a usable schema.org image reference. */
function resolveImageUrl(
  imageUrl: string | null,
  siteOrigin: string | null | undefined,
): string | null {
  if (!imageUrl) return null;
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    // A site-relative stored path is still a real stored image; resolve it when we know the origin.
    if (!siteOrigin || !trimmed.startsWith("/")) return null;
    try {
      const origin = new URL(siteOrigin);
      if (origin.protocol !== "https:" && origin.protocol !== "http:") return null;
      return new URL(trimmed, origin.origin).toString();
    } catch {
      return null;
    }
  }
}

type Place = {
  "@type": "Place";
  name?: string;
  address?: {
    "@type": "PostalAddress";
    streetAddress?: string;
    addressLocality?: string;
  };
};

/** A location is emitted only from a saved venue name or street address — never a guess. */
function buildLocation(event: PublicEventDetail): Place | null {
  const venueName = event.venue?.name?.trim() || null;
  const street = (event.venue?.address ?? event.address)?.trim() || null;
  const city = (event.venue?.city ?? event.city)?.trim() || null;
  // A city alone is not the "venue/address" this schema entry may claim.
  if (!venueName && !street) return null;

  const address: Place["address"] = { "@type": "PostalAddress" };
  if (street) address.streetAddress = street;
  if (city) address.addressLocality = city;

  return {
    "@type": "Place",
    ...(venueName ? { name: venueName } : {}),
    ...(street || city ? { address } : {}),
  };
}

/**
 * One `Offer` per saved active ticket tier. Tiers arrive already filtered to `is_active` by
 * the public event read, so every element here is a real purchasable tier.
 */
function buildOffers(event: PublicEventDetail): Array<Record<string, unknown>> {
  const offers: Array<Record<string, unknown>> = [];
  for (const tier of event.tickets) {
    const cents = tier.priceCents;
    // A malformed price is not a price; inventing one would misstate admission.
    if (!Number.isInteger(cents) || cents < 0) continue;
    const currency = tier.currency?.trim().toUpperCase();
    if (!currency || !/^[A-Z]{3}$/.test(currency)) continue;
    offers.push({
      "@type": "Offer",
      name: tier.name,
      // schema.org price is in major currency units, not cents.
      price: cents / 100,
      priceCurrency: currency,
    });
  }
  return offers;
}

/**
 * Build the JSON-LD object for a public event detail page.
 * Always returns an Event node: the name is a required, stored fact.
 */
export function buildEventStructuredData(
  event: PublicEventDetail,
  options: BuildEventStructuredDataOptions = {},
): EventStructuredData {
  const jsonLd: EventStructuredData = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
  };

  const start = parseStoredDate(event.startsAt);
  // An unparseable stored start is omitted rather than replaced with a guess.
  if (start) jsonLd.startDate = start.toISOString();

  // A stored end equal to the start is a zero-length event and stays factual; only an end
  // that runs backwards is treated as corrupt data and omitted.
  const end = parseStoredDate(event.endsAt);
  if (start && end && end.getTime() >= start.getTime()) jsonLd.endDate = end.toISOString();

  const location = buildLocation(event);
  if (location) jsonLd.location = location;

  const image = resolveImageUrl(event.imageUrl, options.siteOrigin);
  if (image) jsonLd.image = [image];

  const offers = buildOffers(event);
  if (offers.length > 0) jsonLd.offers = offers;

  return jsonLd;
}

/**
 * Serialize for an inline `<script type="application/ld+json">`.
 *
 * `<`, `>` and `&` are escaped so no stored string can close the script element or open a
 * new one ("</script>", "<!--"), and the JavaScript-only line separators are escaped so the
 * value survives every JSON parser.
 */
export function serializeEventStructuredData(jsonLd: EventStructuredData): string {
  return JSON.stringify(jsonLd)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
