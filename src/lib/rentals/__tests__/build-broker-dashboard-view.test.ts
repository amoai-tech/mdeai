import { describe, expect, it } from "vitest";
import { buildBrokerDashboardView, buildViewingRequests } from "../build-broker-dashboard-view";
import { DATA_PENDING_LABEL } from "../data-pending";
import type { BrokerListingDetail } from "../broker-listing-detail";

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

describe("buildBrokerDashboardView", () => {
  it.each([false, true])("uses aggregate KPI counts and truthful preview wording (partial=%s)", (attentionIsPartial) => {
    const view = buildBrokerDashboardView({
      attentionIsPartial,
      displayName: "Ana",
      listings: [
        listing({ id: "a1", listingWorkflowStatus: "published" }),
        listing({ id: "a2", listingWorkflowStatus: "draft", images: [] }),
      ],
      publishedListingsCount: 42,
      leads7dCount: 150,
      viewingsBookedCount: 25,
      apartmentCount: 210,
      unansweredLeads: [
        {
          id: "l1",
          name: "María",
          status: "new",
          created_at: "",
          last_contacted_at: null,
          apartment_id: "a1",
        },
      ],
      upcomingShowings: [
        {
          id: "s1",
          apartment_id: "a1",
          scheduled_at: "2030-01-01T12:00:00.000Z",
          status: "scheduled",
          lead_id: "l1",
          created_at: "2030-01-01T00:00:00.000Z",
        },
      ],
      requestShowings: [
        {
          id: "s1",
          apartment_id: "a1",
          scheduled_at: "2030-01-01T12:00:00.000Z",
          status: "scheduled",
          lead_id: "l1",
          created_at: "2030-01-01T00:00:00.000Z",
        },
      ],
      requestShowingsTotal: 1,
      requestLeads: [
        {
          id: "l1",
          name: "María",
          status: "new",
          created_at: "",
          last_contacted_at: null,
          apartment_id: "a1",
        },
      ],
      leads30dCount: 18,
      views30dCount: null,
    });

    expect(view.attentionIsPartial).toBe(attentionIsPartial);
    expect(view.briefing.bullets).toHaveLength(3);
    expect(view.briefing.bullets.every(b => b.includes("in this preview") === attentionIsPartial)).toBe(true);
    expect(view.kpis[0]?.value).toBe("42");
    expect(view.kpis[1]?.value).toBe("150");
    expect(view.kpis[2]?.value).toBe("25");
    expect(view.kpis[3]?.value).toBe(DATA_PENDING_LABEL);
    expect(view.isEmpty).toBe(false);
  });

  it("uses real published count from listings for attention and data pending for avg response", () => {
    const view = buildBrokerDashboardView({
      displayName: "Ana",
      listings: [
        listing({ id: "a1", listingWorkflowStatus: "published" }),
        listing({ id: "a2", listingWorkflowStatus: "draft", images: [] }),
      ],
      publishedListingsCount: 1,
      leads7dCount: 1,
      viewingsBookedCount: 0,
      apartmentCount: 2,
      unansweredLeads: [
        {
          id: "l1",
          name: "María",
          status: "new",
          created_at: "",
          last_contacted_at: null,
          apartment_id: "a1",
        },
      ],
      upcomingShowings: [],
      requestShowings: [],
      requestShowingsTotal: 0,
      requestLeads: [],
      leads30dCount: 18,
      views30dCount: null,
    });

    expect(view.trends.find((t) => t.id === "leads")?.value).toBe("18");
    expect(view.trends.find((t) => t.id === "views")?.value).toBe(DATA_PENDING_LABEL);
    expect(view.briefing.bullets.some((b) => b.includes("photos"))).toBe(true);
    expect(view.attention.some((a) => a.kind === "lead_unanswered")).toBe(true);
  });

  it("reports empty state when no inventory or activity", () => {
    const view = buildBrokerDashboardView({
      displayName: null,
      listings: [],
      publishedListingsCount: 0,
      leads7dCount: 0,
      viewingsBookedCount: 0,
      apartmentCount: 0,
      unansweredLeads: [],
      upcomingShowings: [],
      requestShowings: [],
      requestShowingsTotal: 0,
      requestLeads: [],
      leads30dCount: 0,
      views30dCount: null,
    });
    expect(view.isEmpty).toBe(true);
    expect(view.kpis.every((k) => k.value === "0" || k.value === DATA_PENDING_LABEL)).toBe(true);
  });

  it("reports the true request total even when the page is capped", () => {
    const page = buildBrokerDashboardView({
      displayName: "Ana",
      listings: [listing({ id: "a1", listingWorkflowStatus: "published" })],
      publishedListingsCount: 1,
      leads7dCount: 0,
      viewingsBookedCount: 0,
      apartmentCount: 1,
      unansweredLeads: [],
      upcomingShowings: [],
      // One row rendered, but 137 requests actually exist.
      requestShowings: [
        {
          id: "s1",
          apartment_id: "a1",
          scheduled_at: "2030-01-01T12:00:00.000Z",
          status: "scheduled",
          lead_id: "l1",
          created_at: "2030-01-01T00:00:00.000Z",
        },
      ],
      requestShowingsTotal: 137,
      requestLeads: [],
      leads30dCount: 0,
      views30dCount: null,
    });

    expect(page.viewingRequests).toHaveLength(1);
    expect(page.viewingRequestsTotal).toBe(137);
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

  it("never calls a bounded empty preview caught up", () => {
    const view = buildBrokerDashboardView({
      displayName: null, listings: [], publishedListingsCount: 200,
      leads7dCount: 0, viewingsBookedCount: 0, apartmentCount: 251,
      unansweredLeads: [], upcomingShowings: [], requestShowings: [],
      requestShowingsTotal: 0, requestLeads: [], leads30dCount: 0, views30dCount: null,
      attentionIsPartial: true,
    });
    expect(view.attentionIsPartial).toBe(true);
    expect(view.briefing.summary).toContain("preview");
    expect(view.briefing.summary).not.toContain("caught up");
  });
});
