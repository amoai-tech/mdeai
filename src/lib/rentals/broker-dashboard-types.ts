import type { BrokerListingsPage } from "./fetch-broker-listings";

/** SAN-1095 · RE-DES-004 — broker dashboard view model (SQL-backed, no fake KPIs). */

/** The three exact attention groups the Overview can act on today. */
export type BrokerAttentionKind =
  | "lead_unanswered"
  | "viewing_pending"
  | "listing";

/**
 * One aggregate attention row with an exact scoped count.
 *
 * SAN-1710 — the Overview shows "5 unanswered enquiries", not a capped list of five
 * rows pretending to be all of them. `action` names an existing destination inside
 * the Overview; it is deliberately not a URL, so a row can never link to an
 * unimplemented sibling screen.
 */
export type BrokerAttentionItem = {
  id: string;
  kind: BrokerAttentionKind;
  title: string;
  detail: string;
  action: "ask_mde" | "listings" | null;
  ctaLabel: string | null;
  testId: string;
};

export type BrokerDashboardKpi = {
  id: string;
  label: string;
  value: string;
  /** The definition of the number, so a broker can tell what it counts. */
  provenance: string;
  testId: string;
};

export type BrokerTrendCard = {
  id: string;
  label: string;
  value: string;
  testId: string;
};

export type BrokerDashboardBriefing = {
  greeting: string;
  summary: string;
  bullets: string[];
};

/**
 * SAN-1204 · one real viewing request, keyed on the persisted rows.
 *
 * A viewing request is one lead and one showing. Rendering them separately would show the
 * same request twice, so a request collapses to exactly one of these.
 */
export type BrokerViewingRequest = {
  leadId: string;
  showingId: string;
  apartmentId: string;
  apartmentTitle: string | null;
  /** Shown beside Today's time when the listing has one; never invented. */
  apartmentNeighborhood: string | null;
  renterName: string | null;
  scheduledAt: string;
  /** Formatted on the server so the client cannot disagree with it during hydration. */
  scheduledLabel: string;
  /** Listing-local clock only ("3:00 PM"), for the compact Today rows. */
  scheduledTimeLabel: string;
  /** When the request arrived. The queue is ordered by this, newest first. */
  createdAt: string;
  status: string;
};

export type BrokerDashboardView = {
  displayName: string | null;
  /** Exactly four metrics, in Overview order: Listings, Open leads, Upcoming, Today. */
  kpis: BrokerDashboardKpi[];
  /** Exact aggregate rows; empty means there is genuinely nothing to act on. */
  attention: BrokerAttentionItem[];
  /** Today's appointments in listing-local time, chronological. */
  todaySchedule: BrokerViewingRequest[];
  /** Exact count of today's appointments, even when `todaySchedule` is bounded. */
  todayTotal: number;
  /** The next appointments after today, chronological, bounded. */
  upcomingPreview: BrokerViewingRequest[];
  /** Exact count of scheduled/confirmed appointments after today. */
  upcomingPreviewTotal: number;
  viewingRequests: BrokerViewingRequest[];
  /** Total requests that exist, so the UI can say when the list is a page rather than all of it. */
  viewingRequestsTotal: number;
  /** Offset of this bounded viewing page; absent for legacy first-page callers. */
  viewingRequestsOffset?: number;
  trends: BrokerTrendCard[];
  briefing: BrokerDashboardBriefing;
  isEmpty: boolean;
};

export type BrokerLeadPage = {
  rows: Array<{
    id: string;
    name: string | null;
    status: string;
    createdAt: string;
    lastContactedAt: string | null;
    apartmentId: string | null;
    apartmentTitle: string | null;
  }>;
  total: number;
  offset: number;
};

export type FetchBrokerDashboardResult =
  | { ok: true; view: BrokerDashboardView; inventory: BrokerListingsPage; leadInbox?: BrokerLeadPage }
  | { ok: false; message: string };
