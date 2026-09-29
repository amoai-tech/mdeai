import type { BrokerListingDetail } from "./broker-listing-detail";
import { LISTING_TIME_ZONE } from "@/lib/leads/schedule-viewing-time";
import { listingCompletenessChecks } from "./listing-completeness";
import { DATA_PENDING_LABEL } from "./data-pending";
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
};

export type BuildBrokerDashboardInput = {
  displayName: string | null;
  listings: BrokerListingDetail[];
  publishedListingsCount: number;
  leads7dCount: number;
  viewingsBookedCount: number;
  apartmentCount: number;
  unansweredLeads: BrokerLeadRow[];
  upcomingShowings: BrokerShowingRow[];
  /** SAN-1204 · every showing for the broker's own apartments, not only upcoming ones. */
  requestShowings: BrokerShowingRow[];
  /** SAN-1204 · how many requests exist in total, so a capped page is never presented as all. */
  requestShowingsTotal: number;
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

/**
 * SAN-1204 · collapse each persisted showing into exactly one visible viewing request.
 *
 * Pure and order-stable so the "one card per request" rule can be unit-tested without Supabase.
 * Requests are sorted newest-scheduled-first, and a showing is never emitted twice.
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
    const renterName = lead?.name?.trim() || lead?.email?.trim() || null;

    requests.push({
      leadId: showing.lead_id,
      showingId: showing.id,
      apartmentId: showing.apartment_id,
      apartmentTitle: titleByApartmentId.get(showing.apartment_id) ?? null,
      renterName,
      scheduledAt: showing.scheduled_at,
      scheduledLabel: formatScheduledLabel(showing.scheduled_at),
      status: showing.status,
    });
  }

  return requests.sort((a, b) => (a.scheduledAt < b.scheduledAt ? 1 : a.scheduledAt > b.scheduledAt ? -1 : 0));
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

/** Pure builder — unit-tested without Supabase. */
// skipcq: JS-0067 - ES module export; not browser global scope
// skipcq: JS-0044, JS-R1005 - attention queue branches; split when SAN-1093 overview grows
export function buildBrokerDashboardView(input: BuildBrokerDashboardInput): BrokerDashboardView {
  const drafts = input.listings.filter((l) => l.listingWorkflowStatus === "draft");

  const draftsNeedingPhotos = drafts.filter((listing) => { // skipcq: JS-0067 - completeness predicate
    const photos = listingCompletenessChecks(listing).find((c) => c.key === "photos");
    return photos ? !photos.complete : listing.images.length < 3;
  });

  const kpis: BrokerDashboardKpi[] = [
    {
      id: "active_listings",
      label: "Active listings",
      value: String(input.publishedListingsCount),
      provenance: "From apartments · published",
      testId: "r1-kpi-0",
    },
    {
      id: "leads_7d",
      label: "New leads (7d)",
      value: String(input.leads7dCount),
      provenance: "From leads · last 7 days",
      testId: "r1-kpi-1",
    },
    {
      id: "viewings_booked",
      label: "Viewings booked",
      value: String(input.viewingsBookedCount),
      provenance: "From showings · upcoming",
      testId: "r1-kpi-2",
    },
    {
      id: "avg_response",
      label: "Avg response time",
      value: DATA_PENDING_LABEL,
      provenance: "Needs lead reply timestamps",
      testId: "r1-kpi-3",
    },
  ];

  const attention: BrokerAttentionItem[] = [];

  for (const listing of draftsNeedingPhotos.slice(0, 5)) {
    attention.push({
      id: `draft-${listing.id}`,
      kind: "draft_missing_photos",
      title: "Listing draft · missing photos",
      detail: listing.title || listing.address || "Untitled draft",
      href: `/host/rentals/listings?focus=${listing.id}`,
      ctaLabel: "Open listing",
      testId: `r1-attn-draft-${listing.id}`,
    });
  }

  for (const lead of input.unansweredLeads.slice(0, 5)) {
    attention.push({
      id: `lead-${lead.id}`,
      kind: "lead_unanswered",
      title: `Lead ${lead.name?.trim() || "Unknown"} · no reply yet`,
      detail: "Status: new",
      href: "/host/rentals/listings",
      ctaLabel: "Open listings",
      testId: `r1-attn-lead-${lead.id}`,
    });
  }

  for (const showing of input.upcomingShowings.filter((s) => s.status === "scheduled").slice(0, 5)) {
    const when = formatScheduledLabel(showing.scheduled_at);
    attention.push({
      id: `showing-${showing.id}`,
      kind: "viewing_confirm",
      title: `Viewing ${when}`,
      detail: "Confirm or decline",
      href: "/host/rentals/listings",
      ctaLabel: "Review",
      testId: `r1-attn-showing-${showing.id}`,
    });
  }

  const attentionCount = attention.length;
  const bullets: string[] = [];
  if (draftsNeedingPhotos.length > 0) {
    bullets.push(
      `${draftsNeedingPhotos.length} listing${draftsNeedingPhotos.length === 1 ? "" : "s"} need photos`,
    );
  }
  if (input.unansweredLeads.length > 0) {
    bullets.push(
      `${input.unansweredLeads.length} lead${input.unansweredLeads.length === 1 ? "" : "s"} waiting`,
    );
  }
  const pendingShowings = input.upcomingShowings.filter((s) => s.status === "scheduled").length;
  if (pendingShowings > 0) {
    bullets.push(
      `${pendingShowings} viewing${pendingShowings === 1 ? "" : "s"} to confirm`,
    );
  }

  const briefing: BrokerDashboardBriefing = {
    greeting: greetingFor(input.displayName),
    summary:
      attentionCount > 0
        ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} need you today.`
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

  const isEmpty =
    input.apartmentCount === 0 &&
    input.leads7dCount === 0 &&
    input.viewingsBookedCount === 0;

  const viewingRequests = buildViewingRequests({
    showings: input.requestShowings,
    leads: input.requestLeads,
    listings: input.listings,
  });

  return {
    displayName: input.displayName,
    kpis,
    attention,
    viewingRequests,
    viewingRequestsTotal: Math.max(input.requestShowingsTotal, viewingRequests.length),
    trends,
    briefing,
    isEmpty,
  };
}
