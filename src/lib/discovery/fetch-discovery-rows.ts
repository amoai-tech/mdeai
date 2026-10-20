/**
 * Server-only data fetchers for the homepage discovery rows (SAN-718, SAN-1556).
 *
 * Each function returns PlaceCardData[]. An empty array means "nothing real to show":
 * the page hides that row. There is NO invented fallback — every card is a real record.
 * All Supabase queries select only the columns they need (no SELECT *).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractNeighborhood, normalizeEventCurrency } from "@/mastra/tools/search-events";
import { loadCafeListings } from "@/lib/cafe-browse";
import { supabaseStorageHost } from "@/lib/images/remote-image-hosts";
import { formatListingMoney, formatRentalPrices } from "@/lib/rental-display";
import { formatDateOnly, isFutureDate, rentalToday } from "@/lib/rentals/date-only";

/** One homepage card. `href` wins; otherwise the card opens the concierge with `query`. */
export interface PlaceCardData {
  id: string;
  name: string;
  kind: string;
  rating: number | null;
  meta: string;
  why: string;
  image: string;
  query: string;
  href?: string;
  /** Events only: the real start (ISO), so the card can show the date first. */
  startsAt?: string;
  /** Descriptive alt text for the photo (defaults to the name). */
  imageAlt?: string;
  /** Who took the photo and under what licence. Set for every openly licensed (non-owned) photo. */
  imageCredit?: { text: string; href: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function priceDollars(level: number | null | undefined): string {
  if (!level || level < 1) return "";
  return "$".repeat(Math.min(Math.max(level, 1), 4));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A stored rating is shown only when it is a real number; an unrated record stays unrated. */
function realRating(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Stored AI summaries are sometimes cut off ("Museo de Antioquia is"); a stub is not a description. */
const MIN_SUMMARY_LENGTH = 40;
function usableSummary(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  return text.length >= MIN_SUMMARY_LENGTH ? text : "";
}

const eventDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

/** The event's real start, in Medellín time. Never a relative word like "Tonight". */
function formatEventStart(isoDate: string): string {
  return eventDateFormatter.format(new Date(isoDate));
}

// ─── Row 1 — Rentals ──────────────────────────────────────────────────────────

type ApartmentRow = {
  id: string;
  title: string;
  neighborhood: string;
  price_monthly: number | null;
  currency: string | null;
  bedrooms: number | null;
  wifi_speed: number | null;
  utilities_included: boolean | null;
  pet_friendly: boolean | null;
  images: string[] | null;
  rating: number | null;
  available_from: string | null;
};

function mapApartmentToCard(row: ApartmentRow): PlaceCardData {
  // The listing's own currency: a COP rent must not be printed with a "$" (it read as $4,300,000/mo).
  const price = row.price_monthly
    ? (formatRentalPrices(null, Number(row.price_monthly), row.currency ?? "USD").monthlyLabel ??
      row.neighborhood)
    : row.neighborhood;

  const hints: string[] = [];
  if (row.neighborhood) hints.push(row.neighborhood);
  if (row.bedrooms) hints.push(`${row.bedrooms}BR`);
  if (row.wifi_speed && row.wifi_speed >= 50) hints.push("fast Wi-Fi");
  if (row.utilities_included) hints.push("bills included");
  if (row.pet_friendly) hints.push("pet-friendly");
  // A future move-in listing must never be described as available now (SAN-486).
  const futureMoveIn = isFutureDate(row.available_from);
  // An upcoming move-in is always shown, however many descriptive hints the card has.
  const upcoming = futureMoveIn && row.available_from ? `Available from ${formatDateOnly(row.available_from)}` : null;
  const why =
    hints.length > 1
      ? `${upcoming ? `${upcoming} · ` : ""}${hints.join(" · ")}.`
      : upcoming
        ? `${upcoming} in ${row.neighborhood}.`
        : `Available now in ${row.neighborhood}.`;

  return {
    id: row.id,
    name: row.title,
    kind: "Rental",
    rating: realRating(row.rating),
    meta: price,
    why,
    image: row.images?.[0] ?? "",
    query: `${row.title} ${row.neighborhood} Medellín rental`,
    href: `/rentals/${encodeURIComponent(row.id)}`,
  };
}

export async function fetchLiveRentals(
  supabase: SupabaseClient,
): Promise<PlaceCardData[]> {
  const { data, error } = await supabase
    .from("apartments")
    .select(
      "id, title, neighborhood, price_monthly, currency, bedrooms, wifi_speed, utilities_included, pet_friendly, images, rating, available_from",
    )
    .eq("moderation_status", "approved")
    .not("images", "is", null)
    // Same rule as search and the viewing RPC (SAN-486): a known move-in date, and not expired.
    .not("available_from", "is", null)
    .or(`available_to.is.null,available_to.gte.${rentalToday()}`)
    .order("rating", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(4);

  if (error || !data?.length) return [];
  return (data as ApartmentRow[]).map(mapApartmentToCard);
}

// ─── Row 2 — Restaurants ─────────────────────────────────────────────────────

type RestaurantRow = {
  id: string;
  name: string;
  neighborhood: string | null;
  cuisine_types: string[];
  price_level: number | null;
  primary_image_url: string | null;
  rating: number | null;
  ai_summary: string | null;
};

function mapRestaurantToCard(row: RestaurantRow): PlaceCardData {
  const priceStr = priceDollars(row.price_level);
  const meta = [row.neighborhood, priceStr].filter(Boolean).join(" · ");
  const kind = row.cuisine_types?.[0] ? capitalize(row.cuisine_types[0]) : "Restaurant";

  return {
    id: row.id,
    name: row.name,
    kind,
    rating: realRating(row.rating),
    meta,
    // No "Highly rated in …" filler: if there is no real summary, the line is simply absent.
    why: usableSummary(row.ai_summary),
    image: row.primary_image_url ?? "",
    query: `${row.name} restaurant ${row.neighborhood ?? "Medellín"}`,
    href: `/restaurants/${encodeURIComponent(row.id)}`,
  };
}

const RESTAURANT_SELECT =
  "id, name, neighborhood, cuisine_types, price_level, primary_image_url, rating, ai_summary";

export async function fetchLiveRestaurants(
  supabase: SupabaseClient,
): Promise<PlaceCardData[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(RESTAURANT_SELECT)
    // Explicit on purpose: in the development phase the table's read policy also lets
    // inactive rows through, so `is_active=false` only hides a record if we ask for it.
    .eq("is_active", true)
    .order("rating", { ascending: false, nullsFirst: false })
    .limit(4);

  if (error || !data?.length) return [];
  return (data as RestaurantRow[]).map(mapRestaurantToCard);
}

// ─── Row 3 — Cafés ───────────────────────────────────────────────────────────

/** Same real source as /cafes (venue anchors). It carries no rating or photo, so none is shown. */
export async function fetchLiveCafes(): Promise<PlaceCardData[]> {
  const { results, error } = await loadCafeListings({ limit: 4 });
  if (error || !results.length) return [];

  return results.map((cafe) => ({
    id: cafe.id,
    name: cafe.name,
    kind: "Café",
    rating: null,
    meta: cafe.neighborhood ?? "Medellín",
    why: usableSummary(cafe.summary),
    image: "",
    query: `${cafe.name} café ${cafe.neighborhood ?? "Medellín"}`,
  }));
}

// ─── Row 4 — Upcoming events ─────────────────────────────────────────────────

const EVENT_CATEGORY_LABEL: Record<string, string> = {
  music: "Music",
  food: "Food & drink",
  culture: "Culture",
  sport: "Sports",
  nightlife: "Nightlife",
  festival: "Festival",
  business: "Business",
  other: "Event",
};

type EventRow = {
  id: string;
  slug: string | null;
  name: string;
  event_type: string | null;
  address: string | null;
  city: string | null;
  event_start_time: string;
  ticket_price_min: number | null;
  currency: string | null;
  primary_image_url: string | null;
};

/**
 * QA / test events created through the real host flow must not be recommended to visitors.
 * Applied in the query itself, so they can never crowd real events out of the first rows.
 * Postgres regex: `\y` is a word boundary (`\b` means backspace there), so "Qatar Night Market"
 * and "Testimonial Gala" are kept while "QA SAN-896 …" and "Test event" are dropped.
 */
const TEST_EVENT_NAME_PATTERN = "^\\s*(qa|test)\\y";

function eventPriceLabel(min: number | null, currency: string | null): string | null {
  // An unknown price stays unknown. (The shared browse mapper turns null into 0 = "Free".)
  if (min == null || !Number.isFinite(Number(min))) return null;
  if (Number(min) === 0) return "Free";
  return formatListingMoney(Math.round(Number(min)), normalizeEventCurrency(currency));
}

export async function fetchLiveEvents(
  supabase: SupabaseClient,
): Promise<PlaceCardData[]> {
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, slug, name, event_type, address, city, event_start_time, ticket_price_min, currency, primary_image_url",
    )
    .eq("is_active", true)
    .in("status", ["published", "live"])
    .not("name", "imatch", TEST_EVENT_NAME_PATTERN)
    .gte("event_start_time", new Date().toISOString())
    .order("event_start_time", { ascending: true })
    .limit(4);

  if (error || !data?.length) return [];

  return (data as EventRow[]).map((row) => {
    // extractNeighborhood falls back to an unaccented "Medellin"; a bare city name is not a
    // neighbourhood, so compare accent-insensitively and show the properly spelled city.
    const neighborhood = extractNeighborhood(row.address, row.city);
    const where = nameKey(neighborhood) === "medellin" ? (row.address ?? "Medellín") : neighborhood;
    const typeKey = (row.event_type ?? "other").toLowerCase();
    return {
      id: row.id,
      name: row.name,
      kind: EVENT_CATEGORY_LABEL[typeKey] ?? "Event",
      // Events carry no user ratings; nothing is shown rather than a made-up number.
      rating: null,
      meta: [formatEventStart(row.event_start_time), eventPriceLabel(row.ticket_price_min, row.currency)]
        .filter(Boolean)
        .join(" · "),
      why: where,
      image: row.primary_image_url ?? "",
      query: `${row.name} Medellín events tickets`,
      href: `/events/${encodeURIComponent(row.slug?.trim() || row.id)}`,
      startsAt: row.event_start_time,
    };
  });
}

// ─── Row 5 — Things to see (tourist destinations) ────────────────────────────

type DestinationRow = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  primary_image_url: string | null;
  details: { image_credit?: ImageCredit } | null;
};

/** Stored in `tourist_destinations.details.image_credit` next to a Wikimedia Commons photo. */
type ImageCredit = {
  source?: string;
  author?: string;
  license?: string;
  license_url?: string;
  source_url?: string;
  alt?: string;
};

/** Editorial order for the first cards. Names missing from the table are simply skipped. */
const FEATURED_DESTINATIONS = [
  "Comuna 13",
  "Plaza Botero",
  "Parque Arví",
  "Museo de Antioquia",
  "Pueblito Paisa",
  "Parque Explora",
  "Jardín Botánico",
  "Metrocable",
] as const;

function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+de medellin$/, "")
    .trim();
}

/**
 * Photos we host ourselves (Supabase storage) are always allowed. Other photo links in the destination
 * table are stock images or Wikimedia paths that do not resolve, and a card must never show a picture of
 * something that is not that place; see `destinationPhoto` for the credited Commons exception.
 */
function ownedImage(url: string | null): string {
  const host = supabaseStorageHost();
  if (!url || !host) return "";
  try {
    return new URL(url).hostname === host ? url : "";
  } catch {
    return "";
  }
}

const COMMONS_PREFIX = "https://upload.wikimedia.org/wikipedia/commons/";

/**
 * A photo is shown when it is ours (Supabase storage), or a Wikimedia Commons image whose record carries
 * its author, licence and source page. Anything else (stock links, dead Commons paths, a Commons URL with
 * no credit) gives the honest text card.
 */
function destinationPhoto(row: DestinationRow): Pick<PlaceCardData, "image" | "imageAlt" | "imageCredit"> {
  const own = ownedImage(row.primary_image_url);
  if (own) return { image: own };
  const url = row.primary_image_url;
  const credit = row.details?.image_credit;
  if (url?.startsWith(COMMONS_PREFIX) && credit?.author && credit.license && credit.source_url) {
    return {
      image: url,
      imageAlt: credit.alt?.trim() || undefined,
      imageCredit: { text: `Photo: ${credit.author} · ${credit.license}`, href: credit.source_url },
    };
  }
  return { image: "" };
}

export async function fetchLiveDestinations(
  supabase: SupabaseClient,
): Promise<PlaceCardData[]> {
  const { data, error } = await supabase
    .from("tourist_destinations")
    .select("id, name, category, description, primary_image_url, details")
    .eq("is_active", true)
    // Neighbourhoods have their own section.
    .neq("category", "Neighborhood")
    .order("name", { ascending: true })
    .limit(60);

  if (error || !data?.length) return [];

  // The table holds some places twice (e.g. Parque Arví); show each place once, keeping the row that has a
  // usable photo. (Array.sort is stable, so the name order is otherwise kept.)
  const rows = (data as DestinationRow[])
    .map((row) => ({ row, photo: destinationPhoto(row) }))
    .sort((a, b) => Number(Boolean(b.photo.image)) - Number(Boolean(a.photo.image)));
  const seen = new Set<string>();
  const unique = rows.filter(({ row }) => {
    const key = nameKey(row.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const rank = (name: string) => {
    const i = FEATURED_DESTINATIONS.indexOf(name as (typeof FEATURED_DESTINATIONS)[number]);
    return i === -1 ? FEATURED_DESTINATIONS.length : i;
  };
  unique.sort((a, b) => rank(a.row.name) - rank(b.row.name));

  return unique.slice(0, 4).map(({ row, photo }) => ({
    id: row.id,
    name: row.name,
    kind: row.category ?? "Place",
    rating: null,
    meta: "",
    why: row.description?.trim() ?? "",
    ...photo,
    query: `Tell me about ${row.name} in Medellín`,
  }));
}
