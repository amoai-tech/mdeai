import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { BrokerListingDetail } from "./broker-listing-detail";
import { filterOwnedBrokerListings } from "./filter-owned-broker-listings";
import { mapBrokerListingRow, type ApartmentBrokerListingRow } from "./map-broker-listing-row";

const BROKER_LISTING_SELECT =
  "id, title, neighborhood, listing_workflow_status, landlord_id, bedrooms, bathrooms, price_monthly, currency, address, description, images, latitude, longitude, published_at, amenities";

export type FetchBrokerListingsResult =
  | { ok: true; listings: BrokerListingDetail[]; landlordProfileIds: string[] }
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
): Promise<FetchBrokerListingsResult> {
  const { data: profiles, error: profileError } = await supabase
    .from("landlord_profiles")
    .select("id")
    .eq("user_id", userId);

  if (profileError) {
    return failListings("landlord_profiles", profileError);
  }

  const landlordProfileIds = (profiles ?? []).map((p) => p.id);

  // No landlord profile means no inventory; skip the round trip entirely.
  if (landlordProfileIds.length === 0) {
    return { ok: true, listings: [], landlordProfileIds: [] };
  }

  const { data, error } = await supabase
    .from("apartments")
    .select(BROKER_LISTING_SELECT)
    // Ownership must be filtered IN THE QUERY, before the row limit. Filtering only afterwards
    // client-side meant this fetched the 200 most recently updated apartments visible under RLS
    // across the whole marketplace, so a broker whose listing fell outside that window lost
    // their own listing — and the viewing-request card rendered "Your listing" instead of the
    // apartment name. `filterOwnedBrokerListings` below stays as defence in depth.
    .in("landlord_id", landlordProfileIds)
    .order("updated_at", { ascending: false })
    // ponytail: still caps a single broker at 200 listings. Raise to a paged query if any broker
    // can exceed that; ownership is already correct, so only volume would be truncated.
    .limit(200);

  if (error) {
    return failListings("apartments", error);
  }

  const mapped = (data as ApartmentBrokerListingRow[]).map(mapBrokerListingRow);
  const listings = filterOwnedBrokerListings(mapped, landlordProfileIds);

  return { ok: true, listings, landlordProfileIds };
}
