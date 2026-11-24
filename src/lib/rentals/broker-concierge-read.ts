import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchBrokerListings } from "@/lib/rentals/fetch-broker-listings";
import { fetchBrokerDashboard } from "@/lib/rentals/fetch-broker-dashboard";

/**
 * Read-only broker context for the existing concierge agent.
 * The user ID and Supabase client MUST come from the authenticated runtime.
 * Never accept an apartment owner, landlord ID, or user ID from model input.
 */
export async function readBrokerWorkspace(
  supabase: SupabaseClient<Database>,
  userId: string,
  focus: "listings" | "viewings" | "overview" = "overview",
) {
  // A dashboard read already contains its scoped inventory. Do not fetch it twice.
  const dashboard = focus === "listings" ? null : await fetchBrokerDashboard(supabase, userId);
  if (dashboard && !dashboard.ok) throw new Error(dashboard.message);
  const inventory = dashboard?.inventory ?? await fetchBrokerListings(supabase, userId);
  if (!inventory.ok) throw new Error(inventory.message);
  if (inventory.landlordProfileIds.length === 0) {
    throw new Error("Set up your rental profile before asking about private broker records.");
  }

  const listings = focus === "viewings"
    ? []
    : inventory.listings.slice(0, 20).map((listing) => ({
        id: listing.id,
        title: listing.title,
        neighborhood: listing.neighborhood,
        status: listing.listingWorkflowStatus,
        priceMonthly: listing.priceMonthly,
        currency: listing.currency,
        bedrooms: listing.bedrooms,
      }));

  if (focus === "listings") {
    return {
      focus,
      listings,
      listingsReturned: listings.length,
      listingsTotal: inventory.total,
      listingsMayBeTruncated: inventory.total > listings.length,
      kpis: [],
      attention: [],
      viewingRequests: [],
      viewingRequestsTotal: null, // Not requested; do not claim zero.
      viewingsMayBeTruncated: false,
    };
  }

  if (!dashboard?.ok) throw new Error("Dashboard unavailable.");
  const { view } = dashboard;
  const requests = view.viewingRequests.slice(0, 20);
  return {
    focus,
    listings,
    listingsReturned: listings.length,
    // This focus deliberately omits listings; that is not pagination/truncation.
    listingsMayBeTruncated: focus === "viewings" ? false :
      inventory.total > listings.length,
    kpis: view.kpis.map(({ label, value }) => ({ label, value })),
    attentionIsPartial: view.attentionIsPartial ?? false,
    listingsTotal: inventory.total,
    attention: view.attention.map(({ title, detail }) => ({ title, detail })),
    viewingRequests: requests.map((request) => ({
      showingId: request.showingId,
      leadId: request.leadId,
      apartmentId: request.apartmentId,
      apartmentTitle: request.apartmentTitle,
      renterName: request.renterName,
      scheduledAt: request.scheduledAt,
      status: request.status,
    })),
    viewingRequestsTotal: view.viewingRequestsTotal,
    viewingsMayBeTruncated: view.viewingRequestsTotal > requests.length,
  };
}
