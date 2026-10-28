import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchBrokerDashboard } from "../fetch-broker-dashboard";
import { fetchBrokerListings } from "../fetch-broker-listings";
import { readBrokerWorkspace } from "../broker-concierge-read";

vi.mock("../fetch-broker-dashboard", () => ({ fetchBrokerDashboard: vi.fn() }));
vi.mock("../fetch-broker-listings", () => ({ fetchBrokerListings: vi.fn() }));

const client = {} as SupabaseClient<Database>;
const actorId = "8e5f0d11-271e-4933-83ca-7e32fdc53467";

const listing = {
  id: "apartment-a", title: "Laureles 2BR", neighborhood: "Laureles",
  listingWorkflowStatus: "draft", priceMonthly: 2400000,
  currency: "COP", bedrooms: 2,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchBrokerListings).mockResolvedValue({
    ok: true, landlordProfileIds: ["profile-a"], listings: [listing] as never,
  });
  vi.mocked(fetchBrokerDashboard).mockResolvedValue({
    ok: true,
    view: {
      displayName: "Carlos", kpis: [{ id:"listings", label:"Listings", value:"1", provenance:"DB", testId:"listings" }],
      attention: [{ id:"lead", kind:"lead_unanswered", title:"Reply to lead", detail:"New lead", href:"/app/rentals", ctaLabel:"Open", testId:"lead" }],
      viewingRequests: [{ leadId:"lead-a", showingId:"show-a", apartmentId:"apartment-a", apartmentTitle:"Laureles 2BR", renterName:"Camila", scheduledAt:"2026-11-01T15:00:00Z", scheduledLabel:"Sunday", createdAt:"2026-10-26T12:00:00Z", status:"requested" }],
      viewingRequestsTotal: 1, trends: [], briefing: {greeting:"Hi",summary:"",bullets:[]}, isEmpty:false,
    },
  });
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
  });

  it("returns actual lead/showing IDs and states without creating actions", async () => {
    const result = await readBrokerWorkspace(client, actorId, "viewings");
    expect(fetchBrokerDashboard).toHaveBeenCalledWith(client, actorId);
    expect(result.viewingRequests).toEqual([{
      leadId:"lead-a", showingId:"show-a", apartmentId:"apartment-a",
      apartmentTitle:"Laureles 2BR", renterName:"Camila",
      scheduledAt:"2026-11-01T15:00:00Z",status:"requested",
    }]);
    expect(result.viewingRequestsTotal).toBe(1);
    expect(result.listings).toEqual([]);
    expect(result.listingsMayBeTruncated).toBe(false);
  });

  it("refuses an authenticated person with no broker profile", async () => {
    vi.mocked(fetchBrokerListings).mockResolvedValue({
      ok:true, landlordProfileIds:[], listings:[],
    });
    await expect(readBrokerWorkspace(client, actorId)).rejects.toThrow(/profile/);
    expect(fetchBrokerDashboard).not.toHaveBeenCalled();
  });

  it("fails closed on a database load failure, not a fabricated empty result", async () => {
    vi.mocked(fetchBrokerListings).mockResolvedValue({ ok:false, message:"Unavailable" });
    await expect(readBrokerWorkspace(client, actorId)).rejects.toThrow("Unavailable");
  });

  it("reports truncated request counts rather than claiming a complete queue", async () => {
    vi.mocked(fetchBrokerDashboard).mockResolvedValueOnce({
      ok:true,view: {
        displayName:null,kpis:[],attention:[],viewingRequests:[],viewingRequestsTotal:60,
        trends:[],briefing:{greeting:"",summary:"",bullets:[]},isEmpty:false,
      },
    });
    const result = await readBrokerWorkspace(client, actorId, "viewings");
    expect(result.viewingsMayBeTruncated).toBe(true);
    expect(result.viewingRequestsTotal).toBe(60);
  });
});
