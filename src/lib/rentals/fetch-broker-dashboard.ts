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
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function failDashboard(context: string, error: unknown): FetchBrokerDashboardResult { // skipcq: JS-0067
  // skipcq: JS-0005 - server-only loader; raw error must not reach UI
  console.error(`[fetchBrokerDashboard] ${context}`, error);
  return { ok: false, message: BROKER_DASHBOARD_LOAD_ERROR };
}

/** Load broker dashboard metrics from Supabase (RLS-scoped). */
// skipcq: JS-0067 - ES module export; not browser global scope
// skipcq: JS-0044, JS-R1005 - sequential Supabase reads; split when SAN-1093 wires partial loaders
export async function fetchBrokerDashboard(
  supabase: DbClient,
  userId: string,
): Promise<FetchBrokerDashboardResult> {
  const { data: profiles, error: profileError } = await supabase
    .from("landlord_profiles")
    .select("id, display_name")
    .eq("user_id", userId);

  if (profileError) {
    return failDashboard("landlord_profiles", profileError);
  }

  const landlordProfileIds = (profiles ?? []).map((p) => p.id);
  const displayName = profiles?.[0]?.display_name ?? null;

  let apartmentIds: string[] = [];
  let publishedListingsCount = 0;

  if (landlordProfileIds.length > 0) {
    const { data: apartmentRows, error: apartmentIdsError } = await supabase
      .from("apartments")
      .select("id")
      .in("landlord_id", landlordProfileIds);

    if (apartmentIdsError) {
      return failDashboard("apartment_ids", apartmentIdsError);
    }
    apartmentIds = (apartmentRows ?? []).map((row) => row.id);

    const { count: publishedCount, error: publishedError } = await supabase
      .from("apartments")
      .select("id", { count: "exact", head: true })
      .in("landlord_id", landlordProfileIds)
      .eq("listing_workflow_status", "published");

    if (publishedError) {
      return failDashboard("published_listings_count", publishedError);
    }
    publishedListingsCount = publishedCount ?? 0;
  }

  const listingsResult = await fetchBrokerListings(supabase, userId);
  if (!listingsResult.ok) {
    return failDashboard("listings", listingsResult);
  }

  let leads7dCount = 0;
  let viewingsBookedCount = 0;
  let unansweredLeads: BrokerLeadRow[] = [];
  let upcomingShowings: BrokerShowingRow[] = [];
  let requestShowings: BrokerShowingRow[] = [];
  let requestShowingsTotal = 0;
  let requestLeads: BrokerLeadRow[] = [];
  let leads30dCount: number | null = null;

  if (apartmentIds.length > 0) {
    const sevenDaysAgo = daysAgoIso(7);
    const thirtyDaysAgo = daysAgoIso(30);
    const nowIso = new Date().toISOString();

    const { count: leads7d, error: leads7dError } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("apartment_id", apartmentIds)
      .gte("created_at", sevenDaysAgo);

    if (leads7dError) {
      return failDashboard("leads_7d_count", leads7dError);
    }
    leads7dCount = leads7d ?? 0;

    const { data: unansweredData, error: unansweredError } = await supabase
      .from("leads")
      .select("id, name, status, created_at, last_contacted_at, apartment_id")
      .in("apartment_id", apartmentIds)
      .eq("status", "new")
      .order("created_at", { ascending: false })
      .limit(20);

    if (unansweredError) {
      return failDashboard("unanswered_leads", unansweredError);
    }
    unansweredLeads = (unansweredData ?? []) as BrokerLeadRow[];

    const { count: leads30d, error: leads30dError } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("apartment_id", apartmentIds)
      .gte("created_at", thirtyDaysAgo);

    if (leads30dError) {
      return failDashboard("leads_30d_count", leads30dError);
    }
    leads30dCount = leads30d ?? 0;

    const { count: upcomingCount, error: showingsCountError } = await supabase
      .from("showings")
      .select("id", { count: "exact", head: true })
      .in("apartment_id", apartmentIds)
      .gte("scheduled_at", nowIso)
      .in("status", ["scheduled", "confirmed"]);

    if (showingsCountError) {
      return failDashboard("viewings_booked_count", showingsCountError);
    }
    viewingsBookedCount = upcomingCount ?? 0;

    const { data: showingsData, error: showingsError } = await supabase
      .from("showings")
      .select("id, apartment_id, scheduled_at, status, lead_id")
      .in("apartment_id", apartmentIds)
      .gte("scheduled_at", nowIso)
      .in("status", ["scheduled", "confirmed"])
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (showingsError) {
      return failDashboard("upcoming_showings", showingsError);
    }
    upcomingShowings = (showingsData ?? []) as BrokerShowingRow[];

    // SAN-1204 — the broker's real viewing requests. This is deliberately NOT limited to
    // upcoming showings: a request whose slot has passed still needs the broker's attention,
    // and hiding it would silently drop a real enquiry.
    // Newest request first. Ordering by scheduled_at descending let far-future appointments
    // crowd out sooner ones, which is the opposite of what a broker needs to act on.
    //
    // The page is capped, so the exact total is read in the same round trip and carried to the
    // UI. A cap without a count would silently hide requests, and a hidden request is a lost
    // enquiry.
    const {
      data: requestShowingsData,
      count: requestShowingsCount,
      error: requestShowingsError,
    } = await supabase
      .from("showings")
      .select("id, apartment_id, scheduled_at, status, lead_id", { count: "exact" })
      .in("apartment_id", apartmentIds)
      .order("created_at", { ascending: false })
      .limit(REQUEST_PAGE_SIZE);

    if (requestShowingsError) {
      return failDashboard("request_showings", requestShowingsError);
    }
    requestShowings = (requestShowingsData ?? []) as BrokerShowingRow[];
    requestShowingsTotal = requestShowingsCount ?? requestShowings.length;

    const requestLeadIds = [...new Set(requestShowings.map((s) => s.lead_id))];
    if (requestLeadIds.length > 0) {
      const { data: requestLeadsData, error: requestLeadsError } = await supabase
        .from("leads")
        .select("id, name, email, status, created_at, last_contacted_at, apartment_id")
        .in("id", requestLeadIds);

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
    apartmentCount: apartmentIds.length,
    unansweredLeads,
    upcomingShowings,
    requestShowings,
    requestShowingsTotal,
    requestLeads,
    leads30dCount,
    views30dCount: null,
  });

  return { ok: true, view };
}
