import { describe, expect, it } from "vitest";
import { buildBrokerDashboardView, buildViewingRequests } from "../build-broker-dashboard-view";
import { DATA_PENDING_LABEL } from "../data-pending";
import type { BrokerListingDetail } from "../broker-listing-detail";
import type { BuildBrokerDashboardInput } from "../build-broker-dashboard-view";

// skipcq: JS-0067 - vitest fixture helper
function listing(overrides: Partial<BrokerListingDetail> = {}): BrokerListingDetail {
  return {
    id: "apt-1",
    title: "Laureles 2BR",
    neighborhood: "Laureles",
    listingWorkflowStatus: "draft",
    landlordId: "landlord-1",
    bedrooms: 2,
    bathrooms: 1,
    priceMonthly: 2_400_000,
    currency: "COP",
    address: "Calle 10",
    description: null,
    images: [],
    latitude: null,
    longitude: null,
    publishedAt: null,
    amenities: [],
    ...overrides,
  };
}

const showing = (overrides: Record<string, unknown> = {}) => ({
  id: "s1",
  apartment_id: "a1",
  scheduled_at: "2030-01-01T12:00:00.000Z",
  status: "scheduled",
  lead_id: "l1",
  created_at: "2030-01-01T00:00:00.000Z",
  apartment: { title: "Laureles 2BR", neighborhood: "Laureles" },
  ...overrides,
});

const lead = (overrides: Record<string, unknown> = {}) => ({
  id: "l1",
  name: "María",
  status: "new",
  created_at: "2029-12-31T00:00:00.000Z",
  last_contacted_at: null,
  apartment_id: "a1",
  ...overrides,
});

function input(overrides: Partial<BuildBrokerDashboardInput> = {}): BuildBrokerDashboardInput {
  return {
    displayName: "Ana",
    listings: [
      listing({ id: "a1", listingWorkflowStatus: "published" }),
      listing({ id: "a2", listingWorkflowStatus: "draft", images: [] }),
    ],
    ownedListingsCount: 210,
    openLeadsCount: 12,
    unansweredLeadsCount: 5,
    pendingDecisionsCount: 1,
    upcomingCount: 8,
    todayShowings: [showing()],
    todayTotal: 3,
    upcomingPreviewShowings: [showing({ id: "s2", scheduled_at: "2030-01-02T12:00:00.000Z" })],
    upcomingPreviewTotal: 7,
    draftsCount: 3,
    noPhotosCount: 2,
    missingDetailsCount: 1,
    requestShowings: [showing()],
    requestShowingsTotal: 1,
    requestLeads: [lead()],
    leads30dCount: 18,
    views30dCount: null,
    ...overrides,
  };
}

describe("buildBrokerDashboardView", () => {
  it("exposes exactly four exact SQL counts in Overview order", () => {
    const view = buildBrokerDashboardView(input());
    expect(view.kpis.map((kpi) => [kpi.label, kpi.value])).toEqual([
      ["Listings", "210"],
      ["Open leads", "12"],
      ["Upcoming", "8"],
      ["Today", "3"],
    ]);
    expect(view.kpis.map((kpi) => kpi.id)).toEqual(["listings_total", "open_leads", "upcoming", "today"]);
    // Every metric states what it counts; no "Data pending" placeholder among them.
    expect(view.kpis.every((kpi) => kpi.provenance.length > 0)).toBe(true);
    expect(view.kpis.some((kpi) => kpi.value === DATA_PENDING_LABEL)).toBe(false);
    expect(view.isEmpty).toBe(false);
  });

  it("states exact attention groups without inventing a distinct total", () => {
    const view = buildBrokerDashboardView(input());
    expect(view.attention.map((item) => [item.kind, item.title, item.action])).toEqual([
      ["lead_unanswered", "5 unanswered enquiries", "ask_mde"],
      ["viewing_pending", "1 viewing request awaiting a decision", null],
      ["listing", "Listings need attention", "listings"],
    ]);
    expect(view.attention[2]?.detail).toBe("3 drafts · 2 without photos · 1 missing details");
    expect(view.briefing.bullets.some((bullet) => bullet.includes("unanswered"))).toBe(true);
  });

  it("uses singular wording and hides groups whose exact count is zero", () => {
    const view = buildBrokerDashboardView(input({
      unansweredLeadsCount: 1,
      pendingDecisionsCount: 0,
      draftsCount: 0,
      noPhotosCount: 0,
      missingDetailsCount: 0,
    }));
    expect(view.attention.map((item) => item.title)).toEqual(["1 unanswered enquiry"]);
    expect(view.attention[0]?.detail).not.toContain("preview");
  });

  it("keeps Today chronological and separates the after-today preview", () => {
    const late = showing({ id: "late", scheduled_at: "2030-01-01T21:30:00.000Z" });
    const early = showing({ id: "early", scheduled_at: "2030-01-01T15:00:00.000Z" });
    const next = showing({ id: "next", scheduled_at: "2030-01-02T15:00:00.000Z" });
    const view = buildBrokerDashboardView(input({
      todayShowings: [late, early],
      todayTotal: 2,
      upcomingPreviewShowings: [next],
      upcomingPreviewTotal: 1,
    }));
    expect(view.todaySchedule.map((row) => row.showingId)).toEqual(["early", "late"]);
    expect(view.todayTotal).toBe(2);
    expect(view.upcomingPreview.map((row) => row.showingId)).toEqual(["next"]);
    expect(view.upcomingPreviewTotal).toBe(1);
    // The preview never repeats a Today row.
    expect(view.upcomingPreview.some((row) => row.showingId === "early" || row.showingId === "late")).toBe(false);
  });

  it("carries the listing-local clock and neighborhood into each request", () => {
    const view = buildBrokerDashboardView(input());
    expect(view.todaySchedule[0]).toMatchObject({
      apartmentTitle: "Laureles 2BR",
      apartmentNeighborhood: "Laureles",
      scheduledTimeLabel: expect.stringMatching(/AM|PM/),
      scheduledLabel: expect.stringMatching(/2030|Jan/),
    });
  });

  it("reports empty state when no inventory or activity", () => {
    const view = buildBrokerDashboardView(input({
      listings: [], ownedListingsCount: 0, openLeadsCount: 0, unansweredLeadsCount: 0,
      pendingDecisionsCount: 0, upcomingCount: 0, todayShowings: [], todayTotal: 0,
      upcomingPreviewShowings: [], upcomingPreviewTotal: 0, draftsCount: 0, noPhotosCount: 0,
      missingDetailsCount: 0, requestShowings: [], requestShowingsTotal: 0, requestLeads: [],
      leads30dCount: 0,
    }));
    expect(view.isEmpty).toBe(true);
    expect(view.kpis.every((kpi) => kpi.value === "0")).toBe(true);
    expect(view.attention).toEqual([]);
    expect(view.briefing.summary).toContain("first listing");
  });

  it("reports the true request total even when the page is capped", () => {
    const page = buildBrokerDashboardView(input({ requestShowingsTotal: 137 }));
    expect(page.viewingRequests).toHaveLength(1);
    expect(page.viewingRequestsTotal).toBe(137);
    expect(page.viewingRequestsOffset).toBe(0);
  });

  it("keeps the derived 30-day trend honest and pending", () => {
    const view = buildBrokerDashboardView(input());
    expect(view.trends.find((t) => t.id === "leads")?.value).toBe("18");
    expect(view.trends.find((t) => t.id === "views")?.value).toBe(DATA_PENDING_LABEL);
  });
});

describe("bounded attention and showing identity", () => {
  it("does not attach another apartment's renter to a showing", () => {
    const requests = buildViewingRequests({
      showings: [{ id: "s1", apartment_id: "a1", lead_id: "l1", scheduled_at: "2026-12-01T15:00:00Z", created_at: "2026-11-24T15:00:00Z", status: "scheduled", apartment: { title: "Apartment A" } }],
      leads: [{ id: "l1", name: "Other renter", status: "new", created_at: "", last_contacted_at: null, apartment_id: "a2" }],
      listings: [],
    });
    expect(requests[0]).toMatchObject({ renterName: null, apartmentTitle: "Apartment A" });
  });
});
