import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  buildBrokerDashboardView,
  type BrokerLeadRow,
  type BrokerShowingRow,
} from "./build-broker-dashboard-view";
import type { BrokerLeadPage, FetchBrokerDashboardResult } from "./broker-dashboard-types";
import { fetchBrokerListings } from "./fetch-broker-listings";

type DbClient = SupabaseClient<Database>;

const BROKER_DASHBOARD_LOAD_ERROR =
  "Couldn't load broker dashboard data. Try again in a moment.";

/** Requests shown per load. The exact total is carried separately so truncation is never silent. */
const REQUEST_PAGE_SIZE = 50;

type Page = { offset?: number; limit?: number };
type DashboardPages = { viewings?: Page; leads?: Page };

function boundedPage(page: Page, defaultLimit: number) {
  const offset = page.offset ?? 0;
  const limit = page.limit ?? defaultLimit;
  if (!Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset + limit - 1)) return null;
  return { offset, limit, end: offset + limit - 1 };
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
  pages: DashboardPages = {},
): Promise<FetchBrokerDashboardResult> {
  const viewingPage = boundedPage(pages.viewings ?? {}, REQUEST_PAGE_SIZE);
  const leadPage = pages.leads ? boundedPage(pages.leads, 50) : null;
  if (!viewingPage || (pages.leads && !leadPage)) {
    return { ok: false, message: "Invalid broker dashboard page." };
  }
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
  let leadInbox: BrokerLeadPage | undefined = leadPage
    ? { rows: [], total: 0, offset: leadPage.offset }
    : undefined;
  let attentionIsPartial = listingsResult.total > listingsResult.listings.length;

  if (landlordProfileIds.length > 0) {
    // One clock snapshot for both rolling windows and upcoming appointments.
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 86_400_000).toISOString();

    // Join the authoritative apartment ownership scope in PostgREST. No unbounded apartment ID array.
    const [leads7d, unanswered, leads30d, upcomingCount, upcoming, requests, inbox] = await Promise.all([
      supabase.from("leads").select("id, apartment:apartments!leads_apartment_id_fkey!inner(landlord_id)", { count: "exact", head: true })
        .in("apartment.landlord_id", landlordProfileIds).gte("created_at", sevenDaysAgo).lte("created_at", nowIso),
      supabase.from("leads").select("id, name, status, created_at, last_contacted_at, apartment_id, apartment:apartments!leads_apartment_id_fkey!inner(landlord_id)", { count: "exact" })
        .in("apartment.landlord_id", landlordProfileIds).eq("status", "new")
        .order("created_at", { ascending: false }).order("id", { ascending: true }).limit(20),
      supabase.from("leads").select("id, apartment:apartments!leads_apartment_id_fkey!inner(landlord_id)", { count: "exact", head: true })
        .in("apartment.landlord_id", landlordProfileIds).gte("created_at", thirtyDaysAgo).lte("created_at", nowIso),
      supabase.from("showings").select("id, apartment:apartments!showings_apartment_id_fkey!inner(landlord_id)", { count: "exact", head: true })
        .in("apartment.landlord_id", landlordProfileIds).gte("scheduled_at", nowIso).in("status", ["scheduled", "confirmed"]),
      supabase.from("showings").select("id, apartment_id, scheduled_at, status, lead_id, created_at, apartment:apartments!showings_apartment_id_fkey!inner(landlord_id,title)", { count: "exact" })
        .in("apartment.landlord_id", landlordProfileIds).gte("scheduled_at", nowIso).eq("status", "scheduled")
        .order("scheduled_at", { ascending: true }).order("id", { ascending: true }).limit(20),
      // Keep past-due requests visible and newest-created first. Exact total is separate.
      supabase.from("showings").select("id, apartment_id, scheduled_at, status, lead_id, created_at, apartment:apartments!showings_apartment_id_fkey!inner(landlord_id,title)", { count: "exact" })
        .in("apartment.landlord_id", landlordProfileIds).order("created_at", { ascending: false })
        .order("id", { ascending: true }).range(viewingPage.offset, viewingPage.end),
      leadPage ? supabase.from("leads")
        .select("id, name, status, created_at, last_contacted_at, apartment_id, apartment:apartments!leads_apartment_id_fkey!inner(landlord_id,title)", { count: "exact" })
        .in("apartment.landlord_id", landlordProfileIds)
        .order("created_at", { ascending: false }).order("id", { ascending: true })
        .range(leadPage.offset, leadPage.end) : null,
    ]);

    if (leads7d.error || leads7d.count === null) return failDashboard("leads_7d_count", leads7d.error ?? "Missing exact total");
    if (unanswered.error || unanswered.count === null) return failDashboard("unanswered_leads", unanswered.error ?? "Missing exact total");
    if (leads30d.error || leads30d.count === null) return failDashboard("leads_30d_count", leads30d.error ?? "Missing exact total");
    if (upcomingCount.error || upcomingCount.count === null) return failDashboard("viewings_booked_count", upcomingCount.error ?? "Missing exact total");
    if (upcoming.error || upcoming.count === null) return failDashboard("upcoming_showings", upcoming.error ?? "Missing exact total");
    // The SDK drops Content-Range counts on errors. Recover only a real out-of-range page,
    // using the same ownership scope; never turn an unrelated failure into empty data.
    const requestOutOfRange = requests.status === 416 && requests.error?.code === "PGRST103";
    const inboxOutOfRange = inbox?.status === 416 && inbox.error?.code === "PGRST103";
    const [requestTotal, inboxTotal] = await Promise.all([
      requestOutOfRange && requests.count === null
        ? supabase.from("showings").select("id, apartment:apartments!showings_apartment_id_fkey!inner(landlord_id)", { count: "exact", head: true })
          .in("apartment.landlord_id", landlordProfileIds)
        : { count: requests.count, error: requestOutOfRange ? null : requests.error },
      inboxOutOfRange && inbox?.count === null
        ? supabase.from("leads").select("id, apartment:apartments!leads_apartment_id_fkey!inner(landlord_id)", { count: "exact", head: true })
          .in("apartment.landlord_id", landlordProfileIds)
        : { count: inbox?.count ?? null, error: inboxOutOfRange ? null : inbox?.error },
    ]);
    if (requestTotal.error || requestTotal.count === null ||
        (requestOutOfRange && viewingPage.offset < requestTotal.count)) {
      return failDashboard("request_showings", requestTotal.error ?? requests.error ?? "Missing exact total");
    }

    leads7dCount = leads7d.count;
    unansweredLeads = (unanswered.data ?? []) as BrokerLeadRow[];
    leads30dCount = leads30d.count;
    viewingsBookedCount = upcomingCount.count;
    upcomingShowings = (upcoming.data ?? []) as BrokerShowingRow[];
    requestShowings = (requests.data ?? []) as BrokerShowingRow[];
    requestShowingsTotal = requestTotal.count;
    attentionIsPartial ||= unanswered.count > 5 || upcoming.count > 5;
    if (inbox && leadPage) {
      if (inboxTotal.error || inboxTotal.count === null ||
          (inboxOutOfRange && leadPage.offset < inboxTotal.count)) {
        return failDashboard("lead_inbox", inboxTotal.error ?? inbox.error ?? "Missing exact total");
      }
      leadInbox = {
        rows: (inbox.data ?? []).map((row) => ({
          id: row.id, name: row.name, status: row.status,
          createdAt: row.created_at, lastContactedAt: row.last_contacted_at,
          apartmentId: row.apartment_id, apartmentTitle: row.apartment?.title ?? null,
        })),
        total: inboxTotal.count, offset: leadPage.offset,
      };
    }

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
    requestShowingsOffset: viewingPage.offset,
    requestLeads,
    leads30dCount,
    views30dCount: null,
    attentionIsPartial,
  });

  return { ok: true, view, inventory: listingsResult, leadInbox };
}
