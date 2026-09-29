/** SAN-1095 · RE-DES-004 — broker dashboard view model (SQL-backed, no fake KPIs). */

export type BrokerAttentionKind =
  | "draft_missing_photos"
  | "lead_unanswered"
  | "viewing_confirm";

export type BrokerAttentionItem = {
  id: string;
  kind: BrokerAttentionKind;
  title: string;
  detail: string;
  href: string;
  ctaLabel: string;
  testId: string;
};

export type BrokerDashboardKpi = {
  id: string;
  label: string;
  value: string;
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
  renterName: string | null;
  scheduledAt: string;
  /** Formatted on the server so the client cannot disagree with it during hydration. */
  scheduledLabel: string;
  /** When the request arrived. The queue is ordered by this, newest first. */
  createdAt: string;
  status: string;
};

export type BrokerDashboardView = {
  displayName: string | null;
  kpis: BrokerDashboardKpi[];
  attention: BrokerAttentionItem[];
  viewingRequests: BrokerViewingRequest[];
  /** Total requests that exist, so the UI can say when the list is a page rather than all of it. */
  viewingRequestsTotal: number;
  trends: BrokerTrendCard[];
  briefing: BrokerDashboardBriefing;
  isEmpty: boolean;
};

export type FetchBrokerDashboardResult =
  | { ok: true; view: BrokerDashboardView }
  | { ok: false; message: string };
