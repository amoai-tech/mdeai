import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerAnonEnv } from "@/lib/supabase/server-env";
import { RentalSearchUnavailableError } from "@/mastra/lib/rental-search-unavailable";
import { readRentalDevelopmentPhase } from "@/mastra/tools/search-rentals";
import {
  isAvailabilityUnconfirmed,
  isSelfAttested,
  isExternalSourceListing,
  externalSourceProvider,
} from "@/lib/rentals/provenance";

/**
 * SAN-1202 · RE-DES-007 — consumer rental detail.
 * Reuses the existing `apartments` table (no new tables). Unknown fields stay
 * `null` so the UI can render "Data pending" — never faked.
 */
export type RentalDetail = {
  id: string;
  slug: string | null;
  title: string;
  neighborhood: string;
  address: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  maxGuests: number | null;
  priceNightly: number | null;
  priceMonthly: number | null;
  currency: string;
  deposit: number | null;
  amenities: string[];
  buildingAmenities: string[];
  images: string[];
  description: string | null;
  houseRules: string | null;
  hostName: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  minimumStayDays: number | null;
  maximumStayDays: number | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  /** The advertiser's own listing, when this is an external candidate (never for MDE-owned rows). */
  sourceUrl: string | null;
  /** Preserved advertiser name for a third-party-source listing (e.g. "Fincaraíz"). */
  sourceProvider: string | null;
  /**
   * SAN-1349 — whether this listing may be requested for a viewing, derived from the same
   * ownership + workflow + availability proof the database enforces. Every scheduling
   * surface reads this instead of assuming a detail page is requestable.
   */
  canScheduleViewing: boolean;
  /**
   * Display an honest provenance notice for self-attested and third-party ads,
   * without changing their development eligibility or booking permissions.
   */
  isNotIndependentlyVerified: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// skipcq: JS-0067 - module-local helper; not browser global scope
const getClient = () => {
  const env = getSupabaseServerAnonEnv();
  if (!env) return null;
  return createClient(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

// skipcq: JS-0067 - module-local helper; not browser global scope
const num = (value: unknown): number | null => {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// skipcq: JS-0067 - module-local helper; not browser global scope
const strArray = (value: unknown): string[] => {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
};

// skipcq: JS-0067 - module-local helper; not browser global scope
const str = (value: unknown): string | null => {
  return typeof value === "string" && value.trim() ? value : null;
};

/** Map a raw `apartments` row to the detail view-model. Exported for unit tests. */
// skipcq: JS-0067 - ES module export; not browser global scope
export function mapApartmentRowToDetail(row: Record<string, unknown>): RentalDetail {
  return {
    id: String(row.id),
    slug: str(row.slug),
    title: str(row.title) ?? "Rental",
    neighborhood: str(row.neighborhood) ?? "",
    address: str(row.address),
    bedrooms: num(row.bedrooms),
    bathrooms: num(row.bathrooms),
    maxGuests: num(row.max_guests) ?? num(row.guests),
    priceNightly: num(row.price_daily),
    priceMonthly: num(row.price_monthly),
    currency: str(row.currency) ?? "USD",
    deposit: num(row.deposit_amount),
    amenities: strArray(row.amenities),
    buildingAmenities: strArray(row.building_amenities),
    images: strArray(row.images),
    description: str(row.description),
    houseRules: str(row.house_rules),
    hostName: str(row.host_name),
    // A placeholder date is not shown as a move-in date; the calendar then says availability is pending.
    availableFrom: isAvailabilityUnconfirmed(row.metadata) ? null : str(row.available_from),
    availableTo: str(row.available_to),
    minimumStayDays: num(row.minimum_stay_days),
    maximumStayDays: num(row.maximum_stay_days),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    status: str(row.status),
    sourceUrl: str(row.source_url),
    sourceProvider: externalSourceProvider(row.metadata),
    // Computed by Supabase under the server-controlled phase, not mirrored in UI.
    canScheduleViewing: row.rental_can_request_viewing === true,
    isNotIndependentlyVerified: isSelfAttested(row.metadata) || isExternalSourceListing(row.metadata),
  };
}

/**
 * Load one published rental by id or slug. Returns null for missing/unpublished
 * (RLS scopes anon reads to active listings). No Supabase env → throws
 * RentalSearchUnavailableError; there are no demo detail pages (SAN-1089).
 */
// skipcq: JS-0067, JS-R1005 - ES module export; intentional db-path + mock-fallback branching, not a bug
export async function getRentalDetail(
  idOrSlug: string,
  options?: { client?: SupabaseClient | null },
): Promise<RentalDetail | null> {
  const client = options?.client ?? getClient();
  if (!client) {
    // SAN-1089: no demo detail pages. The page renders its "couldn't load" state for this.
    throw new RentalSearchUnavailableError("client_unavailable");
  }

  const developmentMode = await readRentalDevelopmentPhase(client);
  let apartmentsQuery = client.from("apartments")
    .select("*, rental_can_request_viewing").limit(1);
  if (!developmentMode) apartmentsQuery = apartmentsQuery.eq("status", "active");
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const { data, error } = await apartmentsQuery.eq(field, idOrSlug).maybeSingle();
  if (error) {
    // Only the stable code travels; the driver message can carry hostnames and ports (SAN-1089).
    throw new RentalSearchUnavailableError(`detail_query_failed${error.code ? `:${error.code}` : ""}`);
  }
  return data ? mapApartmentRowToDetail(data as Record<string, unknown>) : null;
}
