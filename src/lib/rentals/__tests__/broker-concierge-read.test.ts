import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchBrokerDashboard } from "../fetch-broker-dashboard";
import { fetchBrokerListings } from "../fetch-broker-listings";
import { readBrokerWorkspace } from "../broker-concierge-read";
import type { BrokerDashboardView } from "../broker-dashboard-types";

vi.mock("../fetch-broker-dashboard", () => ({ fetchBrokerDashboard: vi.fn() }));
vi.mock("../fetch-broker-listings", () => ({ fetchBrokerListings: vi.fn() }));

const client = {} as SupabaseClient<Database>;
const actorId = "8e5f0d11-271e-4933-83ca-7e32fdc53467";

const listing = {
  id: "apartment-a", title: "Laureles 2BR", neighborhood: "Laureles",
  listingWorkflowStatus: "draft", priceMonthly: 2400000,
  currency: "COP", bedrooms: 2,
};

const inventory = { ok: true as const, landlordProfileIds: ["profile-a"], listings: [listing] as never, displayName: "Carlos", total: 1, offset: 0 };

const request = {
  leadId: "lead-a", showingId: "show-a", apartmentId: "apartment-a",
  apartmentTitle: "Laureles 2BR", apartmentNeighborhood: "Laureles", renterName: "Camila",
  scheduledAt: "2026-11-01T15:00:00Z", scheduledLabel: "Sun, Nov 1, 10:00 AM",
  scheduledTimeLabel: "10:00 AM", createdAt: "2026-10-26T12:00:00Z", status: "scheduled",
};

function view(overrides: Partial<BrokerDashboardView> = {}): BrokerDashboardView {
  return Object.assign({
    displayName: "Carlos",
    kpis: [
      { id: "listings_total", label: "Listings", value: "1", provenance: "All listings you own", testId: "r1-kpi-0" },
      { id: "open_leads", label: "Open leads", value: "2", provenance: "New, contacted or qualified leads", testId: "r1-kpi-1" },
      { id: "upcoming", label: "Upcoming", value: "1", provenance: "Scheduled or confirmed, still ahead", testId: "r1-kpi-2" },
      { id: "today", label: "Today", value: "1", provenance: "Appointments today, Medellín time", testId: "r1-kpi-3" },
    ],
    attention: [{ id: "leads", kind: "lead_unanswered" as const, title: "2 unanswered enquiries", detail: "Renters are waiting for a reply.", action: "ask_mde" as const, ctaLabel: "Ask MDE", testId: "r1-attn-leads" }],
    todaySchedule: [request],
    todayTotal: 1,
    upcomingPreview: [request],
    upcomingPreviewTotal: 1,
    viewingRequests: [request],
    viewingRequestsTotal: 1,
    trends: [],
    briefing: { greeting: "Hi", summary: "", bullets: [] },
    isEmpty: false,
  }, overrides);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchBrokerListings).mockResolvedValue(inventory);
  vi.mocked(fetchBrokerDashboard).mockResolvedValue({ ok: true, inventory, view: view() });
});

describe("readBrokerWorkspace", () => {
  it("returns only caller-scoped real listings, with monthly currency and IDs", async () => {
    const result = await readBrokerWorkspace(client, actorId, "listings");
    expect(fetchBrokerListings).toHaveBeenCalledWith(client, actorId);
    expect(fetchBrokerDashboard).not.toHaveBeenCalled();
    expect(result.listings).toEqual([{
      id:"apartment-a",title:"Laureles 2BR",neighborhood:"Laureles",
      status:"draft",priceMonthly:2400000,currency:"COP",bedrooms:2,
    }]);
    expect(result.viewingRequests).toEqual([]);
    expect(result.viewingRequestsTotal).toBeNull();
    expect(result.listingsTotal).toBe(1);
  });

  it("returns actual lead/showing IDs, states and the exact Overview facts without creating actions", async () => {
    const result = await readBrokerWorkspace(client, actorId, "viewings");
    expect(fetchBrokerDashboard).toHaveBeenCalledWith(client, actorId);
    expect(fetchBrokerListings).not.toHaveBeenCalled();
    expect(result.viewingRequests).toEqual([{
      leadId:"lead-a", showingId:"show-a", apartmentId:"apartment-a",
      apartmentTitle:"Laureles 2BR", renterName:"Camila",
      scheduledAt:"2026-11-01T15:00:00Z",status:"scheduled",
    }]);
    expect(result.viewingRequestsTotal).toBe(1);
    expect(result.listings).toEqual([]);
    expect(result.listingsMayBeTruncated).toBe(false);
    // The grounded answer can quote the same four numbers and today's schedule.
    expect(result.kpis.map((kpi) => [kpi.label, kpi.value])).toEqual([
      ["Listings", "1"], ["Open leads", "2"], ["Upcoming", "1"], ["Today", "1"],
    ]);
    expect(result.today).toMatchObject({ total: 1, appointments: [{ showingId: "show-a", scheduledTime: "10:00 AM" }] });
    expect(result.upcomingPreviewTotal).toBe(1);
    expect(result.attention).toEqual([{ title: "2 unanswered enquiries", detail: "Renters are waiting for a reply." }]);
    expect(result.attentionIsPartial).toBe(false);
  });

  it("refuses an authenticated person with no broker profile", async () => {
    vi.mocked(fetchBrokerListings).mockResolvedValue({
      ok:true, landlordProfileIds:[], listings:[], displayName: null, total: 0, offset: 0,
    });
    await expect(readBrokerWorkspace(client, actorId, "listings")).rejects.toThrow(/profile/);
    expect(fetchBrokerDashboard).not.toHaveBeenCalled();
  });

  it("fails closed on a database load failure, not a fabricated empty result", async () => {
    vi.mocked(fetchBrokerListings).mockResolvedValue({ ok:false, message:"Unavailable" });
    await expect(readBrokerWorkspace(client, actorId, "listings")).rejects.toThrow("Unavailable");
  });

  it("reports truncated request counts rather than claiming a complete queue", async () => {
    vi.mocked(fetchBrokerDashboard).mockResolvedValueOnce({
      ok:true,inventory,view: view({ viewingRequests: [], viewingRequestsTotal: 60, todaySchedule: [], todayTotal: 0 }),
    });
    const result = await readBrokerWorkspace(client, actorId, "viewings");
    expect(result.viewingsMayBeTruncated).toBe(true);
    expect(result.viewingRequestsTotal).toBe(60);
  });
});
