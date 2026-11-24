import type { BrokerListingDetail } from "./broker-listing-detail";
import { DATA_PENDING_LABEL } from "./data-pending";
import { LISTING_TIME_ZONE } from "@/lib/leads/schedule-viewing-time";
import type {
  BrokerAttentionItem,
  BrokerDashboardBriefing,
  BrokerDashboardKpi,
  BrokerDashboardView,
  BrokerTrendCard,
  BrokerViewingRequest,
} from "./broker-dashboard-types";

export type BrokerLeadRow = {
  id: string;
  name: string | null;
  email?: string | null;
  status: string;
  created_at: string;
  last_contacted_at: string | null;
  apartment_id: string | null;
};

export type BrokerShowingRow = {
  id: string;
  apartment_id: string;
  scheduled_at: string;
  status: string;
  lead_id: string;
  /** Joined title and neighborhood remain available beyond the first inventory page. */
  apartment?: { title: string | null; neighborhood?: string | null } | null;
  /** Ordering key for the request queue. Present on every query that builds these rows. */
  created_at: string;
};

export type BuildBrokerDashboardInput = {
  displayName: string | null;
  listings: BrokerListingDetail[];
  /** Exact count of every listing the broker owns, all workflow states. */
  ownedListingsCount: number;
  /** Exact count of leads on owned listings in an open follow-up status. */
  openLeadsCount: number;
  /** Exact count of leads that have not been contacted yet. */
  unansweredLeadsCount: number;
  /** Exact count of appointments the broker still has to confirm or decline. */
  pendingDecisionsCount: number;
  /** Exact count of future scheduled/confirmed appointments. */
  upcomingCount: number;
  /** Today's appointments in listing-local time, chronological. */
  todayShowings: BrokerShowingRow[];
  /** Exact count of today's appointments, even when `todayShowings` is bounded. */
  todayTotal: number;
  /** The next appointments after today, chronological, bounded. */
  upcomingPreviewShowings: BrokerShowingRow[];
  /** Exact count of scheduled/confirmed appointments after today. */
  upcomingPreviewTotal: number;
  /** Exact aggregates for the listing half of Needs attention. */
  draftsCount: number;
  noPhotosCount: number;
  missingDetailsCount: number;
  /** SAN-1204 · every showing for the broker's own apartments, not only upcoming ones. */
  requestShowings: BrokerShowingRow[];
  /** SAN-1204 · how many requests exist in total, so a capped page is never presented as all. */
  requestShowingsTotal: number;
  requestShowingsOffset?: number;
  /** SAN-1204 · leads backing `requestShowings`, joined for the renter's display name. */
  requestLeads: BrokerLeadRow[];
  leads30dCount: number | null;
  views30dCount: number | null;
};

/** Shared viewing-time label. Computed once on the server so SSR and hydration agree. */
function formatScheduledLabel(scheduledAt: string): string { // skipcq: JS-0067 - module-local helper
  // The listing timezone is explicit and shared with the viewing-scheduling contract. Without
  // it this renders in the *server's* zone — Vercel runs UTC — so a 2:00 PM Medellín viewing
  // was shown to the broker as 7:00 PM, five hours wrong.
  return new Date(scheduledAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: LISTING_TIME_ZONE,
  });
}

/** Listing-local clock only, for the compact Today rows. */
function formatScheduledTime(scheduledAt: string): string { // skipcq: JS-0067 - module-local helper
  return new Date(scheduledAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: LISTING_TIME_ZONE,
  });
}

/**
 * SAN-1204 · collapse each persisted showing into exactly one visible viewing request.
 *
 * Pure and order-stable so the "one card per request" rule can be unit-tested without Supabase.
 * Requests keep whatever order the caller supplies; a showing is never emitted twice.
 */
// skipcq: JS-0067 - ES module export; not browser global scope
export function buildViewingRequests(input: {
  showings: BrokerShowingRow[];
  leads: BrokerLeadRow[];
  listings: Pick<BrokerListingDetail, "id" | "title">[];
}): BrokerViewingRequest[] {
  const titleByApartmentId = new Map(input.listings.map((l) => [l.id, l.title]));
  const leadById = new Map(input.leads.map((l) => [l.id, l]));
  const seen = new Set<string>();

  const requests: BrokerViewingRequest[] = [];
  for (const showing of input.showings) {
    if (seen.has(showing.id)) {
      continue;
    }
    seen.add(showing.id);

    const lead = leadById.get(showing.lead_id);
    const renterName = lead?.apartment_id === showing.apartment_id
      ? lead.name?.trim() || lead.email?.trim() || null : null;

    requests.push({
      leadId: showing.lead_id,
      showingId: showing.id,
      apartmentId: showing.apartment_id,
      apartmentTitle: titleByApartmentId.get(showing.apartment_id) ?? showing.apartment?.title ?? null,
      apartmentNeighborhood: showing.apartment?.neighborhood ?? null,
      renterName,
      scheduledAt: showing.scheduled_at,
      scheduledLabel: formatScheduledLabel(showing.scheduled_at),
      scheduledTimeLabel: formatScheduledTime(showing.scheduled_at),
      createdAt: showing.created_at,
      status: showing.status,
    });
  }

  // Newest request first, matching the query's `created_at desc`. The request inbox must
  // not re-sort by appointment date: that silently put the FARTHEST-FUTURE appointments at
  // the top. The Today and Upcoming schedule is chronological, and is sorted separately.
  return requests.sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.showingId.localeCompare(b.showingId);
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

/** Today/Upcoming are read chronologically, not by arrival. */
function chronological(requests: BrokerViewingRequest[]): BrokerViewingRequest[] {
  return [...requests].sort((a, b) => {
    const byTime = Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt);
    return byTime === 0 ? a.showingId.localeCompare(b.showingId) : byTime;
  });
}

function greetingFor(name: string | null): string { // skipcq: JS-0067 - module-local helper
  // Same server-timezone trap as the viewing label: the hour must be the broker's local hour,
  // not the Vercel process hour, or "Good morning" arrives in the afternoon.
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: LISTING_TIME_ZONE })
      .format(new Date()),
  );
  const salutation = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name?.trim() ? `${salutation}, ${name.trim()}.` : `${salutation}.`;
}

/** Exact counts that are available only when the underlying number is known. */
function attentionItems(input: BuildBrokerDashboardInput): BrokerAttentionItem[] {
  const attention: BrokerAttentionItem[] = [];

  if (input.unansweredLeadsCount > 0) {
    attention.push({
      id: "leads",
      kind: "lead_unanswered",
      title: `${input.unansweredLeadsCount} unanswered enquir${input.unansweredLeadsCount === 1 ? "y" : "ies"}`,
      detail: "Renters are waiting for a reply.",
      action: "ask_mde",
      ctaLabel: "Ask MDE",
      testId: "r1-attn-leads",
    });
  }

  if (input.pendingDecisionsCount > 0) {
    attention.push({
      id: "viewings",
      kind: "viewing_pending",
      title: `${input.pendingDecisionsCount} viewing request${input.pendingDecisionsCount === 1 ? "" : "s"} awaiting a decision`,
      detail: "Confirm, decline or reschedule from Today or Upcoming.",
      action: null,
      ctaLabel: null,
      testId: "r1-attn-viewings",
    });
  }

  // The listing breakdown is exact per category. It is deliberately NOT summed:
  // one draft can also have no photos, and adding the rows would inflate the count.
  const listingIssues: string[] = [];
  if (input.draftsCount > 0) listingIssues.push(`${input.draftsCount} draft${input.draftsCount === 1 ? "" : "s"}`);
  if (input.noPhotosCount > 0) listingIssues.push(`${input.noPhotosCount} without photos`);
  if (input.missingDetailsCount > 0) listingIssues.push(`${input.missingDetailsCount} missing details`);

  if (listingIssues.length > 0) {
    attention.push({
      id: "listings",
      kind: "listing",
      title: "Listings need attention",
      detail: listingIssues.join(" · "),
      action: "listings",
      ctaLabel: "Manage listings",
      testId: "r1-attn-listings",
    });
  }

  return attention;
}

/** Pure builder — unit-tested without Supabase. */
// skipcq: JS-0067 - ES module export; not browser global scope
// skipcq: JS-0044, JS-R1005 - the four real metrics and the attention queue are one contract
export function buildBrokerDashboardView(input: BuildBrokerDashboardInput): BrokerDashboardView {
  // Exactly four metrics, in the order the Overview renders them. Every value is an
  // exact RLS-scoped count from the database, never a capped page length.
  const kpis: BrokerDashboardKpi[] = [
    {
      id: "listings_total",
      label: "Listings",
      value: String(input.ownedListingsCount),
      provenance: "All listings you own",
      testId: "r1-kpi-0",
    },
    {
      id: "open_leads",
      label: "Open leads",
      value: String(input.openLeadsCount),
      provenance: "New, contacted or qualified leads",
      testId: "r1-kpi-1",
    },
    {
      id: "upcoming",
      label: "Upcoming",
      value: String(input.upcomingCount),
      provenance: "Scheduled or confirmed, still ahead",
      testId: "r1-kpi-2",
    },
    {
      id: "today",
      label: "Today",
      value: String(input.todayTotal),
      provenance: "Appointments today, Medellín time",
      testId: "r1-kpi-3",
    },
  ];

  const attention = attentionItems(input);
  const attentionCount = attention.length;
  const isEmpty =
    input.ownedListingsCount === 0 &&
    input.openLeadsCount === 0 &&
    input.upcomingCount === 0;
  const bullets = attention.map((item) => `${item.title}: ${item.detail}`);
  const briefing: BrokerDashboardBriefing = {
    greeting: greetingFor(input.displayName),
    summary: isEmpty
      ? "Your workspace is ready. Add your first listing to get started."
      : attentionCount > 0
        ? `${attentionCount} group${attentionCount === 1 ? "" : "s"} needing attention.`
        : "You're caught up on listings and leads.",
    bullets,
  };

  const trends: BrokerTrendCard[] = [
    {
      id: "occupancy",
      label: "Occupancy",
      value: DATA_PENDING_LABEL,
      testId: "r1-trend-occupancy",
    },
    {
      id: "leads",
      label: "Leads (30d)",
      value:
        input.leads30dCount === null ? DATA_PENDING_LABEL : String(input.leads30dCount),
      testId: "r1-trend-leads",
    },
    {
      id: "conversion",
      label: "Conversion",
      value: DATA_PENDING_LABEL,
      testId: "r1-trend-conversion",
    },
    {
      id: "views",
      label: "Views (30d)",
      value:
        input.views30dCount === null ? DATA_PENDING_LABEL : String(input.views30dCount),
      testId: "r1-trend-views",
    },
  ];

  const viewingRequests = buildViewingRequests({
    showings: input.requestShowings,
    leads: input.requestLeads,
    listings: input.listings,
  });

  // Today and Upcoming carry their own joined titles, so they stay correct even when a
  // listing falls outside the bounded inventory page. Their leads are joined below.
  const todaySchedule = chronological(buildViewingRequests({
    showings: input.todayShowings,
    leads: input.requestLeads,
    listings: input.listings,
  }));
  const upcomingPreview = chronological(buildViewingRequests({
    showings: input.upcomingPreviewShowings,
    leads: input.requestLeads,
    listings: input.listings,
  }));

  return {
    displayName: input.displayName,
    kpis,
    attention,
    todaySchedule,
    todayTotal: Math.max(input.todayTotal, todaySchedule.length),
    upcomingPreview,
    upcomingPreviewTotal: Math.max(input.upcomingPreviewTotal, upcomingPreview.length),
    viewingRequests,
    viewingRequestsTotal: Math.max(input.requestShowingsTotal, viewingRequests.length),
    viewingRequestsOffset: input.requestShowingsOffset ?? 0,
    trends,
    briefing,
    isEmpty,
  };
}
