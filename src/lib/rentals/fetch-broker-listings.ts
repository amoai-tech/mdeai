import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { BrokerListingDetail } from "./broker-listing-detail";
import { filterOwnedBrokerListings } from "./filter-owned-broker-listings";
import { mapBrokerListingRow, type ApartmentBrokerListingRow } from "./map-broker-listing-row";

const BROKER_LISTING_SELECT =
  "id, title, neighborhood, listing_workflow_status, landlord_id, bedrooms, bathrooms, price_monthly, currency, address, description, images, latitude, longitude, published_at, amenities";

export type BrokerListingsPage = {
  ok: true;
  listings: BrokerListingDetail[];
  landlordProfileIds: string[];
  displayName: string | null;
  total: number;
  offset: number;
};

export type FetchBrokerListingsResult =
  | BrokerListingsPage
  | { ok: false; message: string };

type DbClient = SupabaseClient<Database>;

const BROKER_LISTINGS_LOAD_ERROR =
  "Couldn't load your listings. Try again in a moment.";

function failListings(context: string, error: unknown): FetchBrokerListingsResult { // skipcq: JS-0067
  // skipcq: JS-0005 - server-only loader; raw error must not reach UI
  console.error(`[fetchBrokerListings] ${context}`, error);
  return { ok: false, message: BROKER_LISTINGS_LOAD_ERROR };
}

/** Load broker-scoped apartment inventory (RLS + explicit landlord filter). */
// skipcq: JS-0067 - ES module export; not browser global scope
export async function fetchBrokerListings(
  supabase: DbClient,
  userId: string,
  page: { offset?: number; limit?: number } = {},
): Promise<FetchBrokerListingsResult> {
  const offset = page.offset ?? 0;
  const limit = page.limit ?? 200;
  if (!Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 200 ||
      !Number.isSafeInteger(offset + limit - 1)) {
    return { ok: false, message: "Invalid listings page." };
  }
  const { data: profiles, error: profileError } = await supabase
    .from("landlord_profiles")
    .select("id, display_name")
    .eq("user_id", userId);

  if (profileError) {
    return failListings("landlord_profiles", profileError);
  }

  const landlordProfileIds = (profiles ?? []).map((p) => p.id);

  // No landlord profile means no inventory; skip the round trip entirely.
  if (landlordProfileIds.length === 0) {
    return { ok: true, listings: [], landlordProfileIds: [], displayName: null, total: 0, offset };
  }

  const { data, error, count, status } = await supabase
    .from("apartments")
    .select(BROKER_LISTING_SELECT, { count: "exact" })
    // Ownership must be filtered IN THE QUERY, before the row limit. Filtering only afterwards
    // client-side meant this fetched the 200 most recently updated apartments visible under RLS
    // across the whole marketplace, so a broker whose listing fell outside that window lost
    // their own listing — and the viewing-request card rendered "Your listing" instead of the
    // apartment name. `filterOwnedBrokerListings` below stays as defence in depth.
    .in("landlord_id", landlordProfileIds)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  // PostgREST rejects a stale page offset; the SDK may discard the error response count.
  // Only recover when the same broker-scoped exact total proves the page is past the end.
  if (status === 416 && error?.code === "PGRST103") {
    const exact = count === null
      ? await supabase.from("apartments").select("id", { count: "exact", head: true })
        .in("landlord_id", landlordProfileIds)
      : { count, error: null };
    if (exact.error || exact.count === null || offset < exact.count) {
      return failListings("apartments", exact.error ?? error);
    }
    return { ok: true, listings: [], landlordProfileIds, displayName: profiles?.[0]?.display_name ?? null, total: exact.count, offset };
  }

  if (error || count === null) {
    return failListings("apartments", error ?? "Missing exact total");
  }

  const mapped = ((data ?? []) as ApartmentBrokerListingRow[]).map(mapBrokerListingRow);
  const listings = filterOwnedBrokerListings(mapped, landlordProfileIds);

  return { ok: true, listings, landlordProfileIds, displayName: profiles?.[0]?.display_name ?? null, total: count, offset };
}
