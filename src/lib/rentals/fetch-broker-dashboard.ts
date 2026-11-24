import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { listingDayBounds } from "@/lib/leads/schedule-viewing-time";
import {
  BROKER_APPOINTMENT_STATUSES,
  BROKER_OPEN_LEAD_STATUSES,
  BROKER_PENDING_APPOINTMENT_STATUSES,
  BROKER_UNANSWERED_LEAD_STATUSES,
} from "./broker-overview-status";
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
/** Today's card is a day, not an inbox: cap the rows while keeping the exact count. */
const TODAY_ROW_LIMIT = 50;
/** The Overview shows a bounded preview, never the whole calendar. */
const UPCOMING_PREVIEW_LIMIT = 5;

type Page = { offset?: number; limit?: number };
type DashboardPages = { viewings?: Page; leads?: Page };

const SHOWING_SELECT =
  "id, apartment_id, scheduled_at, status, lead_id, created_at, apartment:apartments!showings_apartment_id_fkey!inner(landlord_id,title,neighborhood)";

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

/**
 * Load broker dashboard metrics from Supabase (RLS-scoped).
 *
 * SAN-1710 — every Overview number is an exact count or a direct row read. Nothing
 * is derived by subtracting bounded pages, and the Bogotá day boundary is resolved
 * once so the Today count and Today rows cannot disagree.
 */
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

  let openLeadsCount = 0;
  let unansweredLeadsCount = 0;
  let pendingDecisionsCount = 0;
  let upcomingCount = 0;
  let todayTotal = 0;
  let upcomingPreviewTotal = 0;
  let draftsCount = 0;
  let noPhotosCount = 0;
  let missingDetailsCount = 0;
  let todayShowings: BrokerShowingRow[] = [];
  let upcomingPreviewShowings: BrokerShowingRow[] = [];
  let requestShowings: BrokerShowingRow[] = [];
  let requestShowingsTotal = 0;
  let requestLeads: BrokerLeadRow[] = [];
  let leads30dCount: number | null = 0;
  let leadInbox: BrokerLeadPage | undefined = leadPage
    ? { rows: [], total: 0, offset: leadPage.offset }
    : undefined;

  if (landlordProfileIds.length > 0) {
    // One clock snapshot for the metrics, the local day and every window below.
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 86_400_000).toISOString();
    const day = listingDayBounds(new Date(now));

    // Join the authoritative apartment ownership scope in PostgREST. No unbounded apartment ID array.
    const [
      openLeads,
      unansweredLeads,
      pendingDecisions,
      upcoming,
      today,
      upcomingPreview,
      drafts,
      noPhotos,
      missingDetails,
      leads30d,
      requests,
      inbox,
    ] = await Promise.all([
      supabase.from("leads").select("id, apartment:apartments!leads_apartment_id_fkey!inner(landlord_id)", { count: "exact", head: true })
        .in("apartment.landlord_id", landlordProfileIds).in("status", [...BROKER_OPEN_LEAD_STATUSES]),
      supabase.from("leads").select("id, apartment:apartments!leads_apartment_id_fkey!inner(landlord_id)", { count: "exact", head: true })
        .in("apartment.landlord_id", landlordProfileIds).in("status", [...BROKER_UNANSWERED_LEAD_STATUSES]),
      // A request nobody has answered still needs a decision even after its slot
      // passed: the broker can decline or reschedule it. Do not hide that backlog.
      supabase.from("showings").select("id, apartment:apartments!showings_apartment_id_fkey!inner(landlord_id)", { count: "exact", head: true })
        .in("apartment.landlord_id", landlordProfileIds)
        .in("status", [...BROKER_PENDING_APPOINTMENT_STATUSES]),
      supabase.from("showings").select("id, apartment:apartments!showings_apartment_id_fkey!inner(landlord_id)", { count: "exact", head: true })
        .in("apartment.landlord_id", landlordProfileIds).gte("scheduled_at", nowIso)
        .in("status", [...BROKER_APPOINTMENT_STATUSES]),
      supabase.from("showings").select(SHOWING_SELECT, { count: "exact" })
        .in("apartment.landlord_id", landlordProfileIds).gte("scheduled_at", day.start).lt("scheduled_at", day.end)
        .in("status", [...BROKER_APPOINTMENT_STATUSES])
        .order("scheduled_at", { ascending: true }).order("id", { ascending: true }).limit(TODAY_ROW_LIMIT),
      // The preview starts after today so it never repeats a Today row.
      supabase.from("showings").select(SHOWING_SELECT, { count: "exact" })
        .in("apartment.landlord_id", landlordProfileIds).gte("scheduled_at", day.end)
        .in("status", [...BROKER_APPOINTMENT_STATUSES])
        .order("scheduled_at", { ascending: true }).order("id", { ascending: true }).limit(UPCOMING_PREVIEW_LIMIT),
      supabase.from("apartments").select("id", { count: "exact", head: true })
        .in("landlord_id", landlordProfileIds).eq("listing_workflow_status", "draft"),
      // Exact "no photos": the array default is '{}', but legacy rows can be NULL.
      supabase.from("apartments").select("id", { count: "exact", head: true })
        .in("landlord_id", landlordProfileIds).or("images.is.null,images.eq.{}"),
      // Blank is incomplete too: `listingCompletenessChecks` trims these fields, and a
      // wizard draft can store '' without violating the NOT NULL constraint on title.
      supabase.from("apartments").select("id", { count: "exact", head: true })
        .in("landlord_id", landlordProfileIds)
        .or("description.is.null,description.eq.,title.eq.,neighborhood.eq.,price_monthly.is.null,bedrooms.is.null"),
      supabase.from("leads").select("id, apartment:apartments!leads_apartment_id_fkey!inner(landlord_id)", { count: "exact", head: true })
        .in("apartment.landlord_id", landlordProfileIds).gte("created_at", thirtyDaysAgo).lte("created_at", nowIso),
      // Keep past-due requests visible and newest-created first. Exact total is separate.
      supabase.from("showings").select(SHOWING_SELECT, { count: "exact" })
        .in("apartment.landlord_id", landlordProfileIds).order("created_at", { ascending: false })
        .order("id", { ascending: true }).range(viewingPage.offset, viewingPage.end),
      leadPage ? supabase.from("leads")
        .select("id, name, status, created_at, last_contacted_at, apartment_id, apartment:apartments!leads_apartment_id_fkey!inner(landlord_id,title)", { count: "exact" })
        .in("apartment.landlord_id", landlordProfileIds)
        .order("created_at", { ascending: false }).order("id", { ascending: true })
        .range(leadPage.offset, leadPage.end) : null,
    ]);

    if (openLeads.error || openLeads.count === null) return failDashboard("open_leads_count", openLeads.error ?? "Missing exact total");
    if (unansweredLeads.error || unansweredLeads.count === null) return failDashboard("unanswered_leads", unansweredLeads.error ?? "Missing exact total");
    if (pendingDecisions.error || pendingDecisions.count === null) return failDashboard("pending_decisions_count", pendingDecisions.error ?? "Missing exact total");
    if (upcoming.error || upcoming.count === null) return failDashboard("viewings_booked_count", upcoming.error ?? "Missing exact total");
    if (today.error || today.count === null) return failDashboard("today_showings", today.error ?? "Missing exact total");
    if (upcomingPreview.error || upcomingPreview.count === null) return failDashboard("upcoming_preview", upcomingPreview.error ?? "Missing exact total");
    if (drafts.error || drafts.count === null) return failDashboard("draft_listings_count", drafts.error ?? "Missing exact total");
    if (noPhotos.error || noPhotos.count === null) return failDashboard("photo_less_listings_count", noPhotos.error ?? "Missing exact total");
    if (missingDetails.error || missingDetails.count === null) return failDashboard("incomplete_listings_count", missingDetails.error ?? "Missing exact total");
    if (leads30d.error || leads30d.count === null) return failDashboard("leads_30d_count", leads30d.error ?? "Missing exact total");

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

    openLeadsCount = openLeads.count;
    unansweredLeadsCount = unansweredLeads.count;
    pendingDecisionsCount = pendingDecisions.count;
    upcomingCount = upcoming.count;
    todayTotal = today.count;
    todayShowings = (today.data ?? []) as BrokerShowingRow[];
    upcomingPreviewTotal = upcomingPreview.count;
    upcomingPreviewShowings = (upcomingPreview.data ?? []) as BrokerShowingRow[];
    draftsCount = drafts.count;
    noPhotosCount = noPhotos.count;
    missingDetailsCount = missingDetails.count;
    leads30dCount = leads30d.count;
    requestShowings = (requests.data ?? []) as BrokerShowingRow[];
    requestShowingsTotal = requestTotal.count;
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

    // Today and Upcoming rows need their renter names too. One narrow read covers both,
    // plus the request page the View-all dialog shows.
    const requestLeadIds = [...new Set([
      ...requestShowings.map((s) => s.lead_id),
      ...todayShowings.map((s) => s.lead_id),
      ...upcomingPreviewShowings.map((s) => s.lead_id),
    ])];
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
    ownedListingsCount: listingsResult.total,
    openLeadsCount,
    unansweredLeadsCount,
    pendingDecisionsCount,
    upcomingCount,
    todayShowings,
    todayTotal,
    upcomingPreviewShowings,
    upcomingPreviewTotal,
    draftsCount,
    noPhotosCount,
    missingDetailsCount,
    requestShowings,
    requestShowingsTotal,
    requestShowingsOffset: viewingPage.offset,
    requestLeads,
    leads30dCount,
    views30dCount: null,
  });

  return { ok: true, view, inventory: listingsResult, leadInbox };
}
