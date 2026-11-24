import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  buildBrokerDashboardView,
  type BrokerLeadRow,
  type BrokerShowingRow,
} from "./build-broker-dashboard-view";
import type { FetchBrokerDashboardResult } from "./broker-dashboard-types";
import { fetchBrokerListings } from "./fetch-broker-listings";

type DbClient = SupabaseClient<Database>;

const BROKER_DASHBOARD_LOAD_ERROR =
  "Couldn't load broker dashboard data. Try again in a moment.";

/** Requests shown per load. The exact total is carried separately so truncation is never silent. */
const REQUEST_PAGE_SIZE = 50;

function daysAgoIso(days: number): string { // skipcq: JS-0067 - module-local helper
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function failDashboard(context: string, error: unknown): FetchBrokerDashboardResult { // skipcq: JS-0067
  // skipcq: JS-0005 - server-only loader; raw error must not reach UI
  console.error(`[fetchBrokerDashboard] ${context}`, error);
  return { ok: false, message: BROKER_DASHBOARD_LOAD_ERROR };
}

/** Load broker dashboard metrics from Supabase (RLS-scoped). */
// skipcq: JS-0067 - ES module export; not browser global scope
// skipcq: JS-0044, JS-R1005 - scoped reads, independent requests grouped
export async function fetchBrokerDashboard(
  supabase: DbClient,
  userId: string,
): Promise<FetchBrokerDashboardResult> {
  const listingsResult = await fetchBrokerListings(supabase, userId);
  if (!listingsResult.ok) return failDashboard("listings", listingsResult);
  const { landlordProfileIds, displayName } = listingsResult;

  let publishedListingsCount = 0;
  if (landlordProfileIds.length > 0) {
    const published = await supabase.from("apartments").select("id", { count: "exact", head: true })
      .in("landlord_id", landlordProfileIds).eq("listing_workflow_status", "published");
    if (published.error || published.count === null) return failDashboard("published_listings_count", published.error ?? "Missing exact total");
    publishedListingsCount = published.count;
  }

  let leads7dCount = 0;
  let viewingsBookedCount = 0;
  let unansweredLeads: BrokerLeadRow[] = [];
  let upcomingShowings: BrokerShowingRow[] = [];
  let requestShowings: BrokerShowingRow[] = [];
  let requestShowingsTotal = 0;
  let requestLeads: BrokerLeadRow[] = [];
  let leads30dCount: number | null = 0;

  if (landlordProfileIds.length > 0) {
    const sevenDaysAgo = daysAgoIso(7);
    const thirtyDaysAgo = daysAgoIso(30);
    const nowIso = new Date().toISOString();

    // Join the authoritative apartment ownership scope in PostgREST. No unbounded apartment ID array.
    const [leads7d, unanswered, leads30d, upcomingCount, upcoming, requests] = await Promise.all([
      supabase.from("leads").select("id, apartment:apartments!leads_apartment_id_fkey!inner(landlord_id)", { count: "exact", head: true })
        .in("apartment.landlord_id", landlordProfileIds).gte("created_at", sevenDaysAgo),
      supabase.from("leads").select("id, name, status, created_at, last_contacted_at, apartment_id, apartment:apartments!leads_apartment_id_fkey!inner(landlord_id)")
        .in("apartment.landlord_id", landlordProfileIds).eq("status", "new")
        .order("created_at", { ascending: false }).order("id", { ascending: true }).limit(20),
      supabase.from("leads").select("id, apartment:apartments!leads_apartment_id_fkey!inner(landlord_id)", { count: "exact", head: true })
        .in("apartment.landlord_id", landlordProfileIds).gte("created_at", thirtyDaysAgo),
      supabase.from("showings").select("id, apartment:apartments!showings_apartment_id_fkey!inner(landlord_id)", { count: "exact", head: true })
        .in("apartment.landlord_id", landlordProfileIds).gte("scheduled_at", nowIso).in("status", ["scheduled", "confirmed"]),
      supabase.from("showings").select("id, apartment_id, scheduled_at, status, lead_id, created_at, apartment:apartments!showings_apartment_id_fkey!inner(landlord_id,title)")
        .in("apartment.landlord_id", landlordProfileIds).gte("scheduled_at", nowIso).in("status", ["scheduled", "confirmed"])
        .order("scheduled_at", { ascending: true }).order("id", { ascending: true }).limit(20),
      // Keep past-due requests visible and newest-created first. Exact total is separate.
      supabase.from("showings").select("id, apartment_id, scheduled_at, status, lead_id, created_at, apartment:apartments!showings_apartment_id_fkey!inner(landlord_id,title)", { count: "exact" })
        .in("apartment.landlord_id", landlordProfileIds).order("created_at", { ascending: false })
        .order("id", { ascending: true }).limit(REQUEST_PAGE_SIZE),
    ]);

    if (leads7d.error || leads7d.count === null) return failDashboard("leads_7d_count", leads7d.error ?? "Missing exact total");
    if (unanswered.error) return failDashboard("unanswered_leads", unanswered.error);
    if (leads30d.error || leads30d.count === null) return failDashboard("leads_30d_count", leads30d.error ?? "Missing exact total");
    if (upcomingCount.error || upcomingCount.count === null) return failDashboard("viewings_booked_count", upcomingCount.error ?? "Missing exact total");
    if (upcoming.error) return failDashboard("upcoming_showings", upcoming.error);
    if (requests.error || requests.count === null) return failDashboard("request_showings", requests.error ?? "Missing exact total");

    leads7dCount = leads7d.count;
    unansweredLeads = (unanswered.data ?? []) as BrokerLeadRow[];
    leads30dCount = leads30d.count;
    viewingsBookedCount = upcomingCount.count;
    upcomingShowings = (upcoming.data ?? []) as BrokerShowingRow[];
    requestShowings = (requests.data ?? []) as BrokerShowingRow[];
    requestShowingsTotal = requests.count;

    const requestLeadIds = [...new Set(requestShowings.map((s) => s.lead_id))];
    if (requestLeadIds.length > 0) {
      const { data: requestLeadsData, error: requestLeadsError } = await supabase
        .from("leads")
        .select("id, name, email, status, created_at, last_contacted_at, apartment_id, apartment:apartments!leads_apartment_id_fkey!inner(landlord_id)")
        .in("id", requestLeadIds).in("apartment.landlord_id", landlordProfileIds);

      if (requestLeadsError) {
        return failDashboard("request_leads", requestLeadsError);
      }
      requestLeads = (requestLeadsData ?? []) as BrokerLeadRow[];
    }
  }

  const view = buildBrokerDashboardView({
    displayName,
    listings: listingsResult.listings,
    publishedListingsCount,
    leads7dCount,
    viewingsBookedCount,
    apartmentCount: listingsResult.total,
    unansweredLeads,
    upcomingShowings,
    requestShowings,
    requestShowingsTotal,
    requestLeads,
    leads30dCount,
    views30dCount: null,
  });

  return { ok: true, view, inventory: listingsResult };
}
