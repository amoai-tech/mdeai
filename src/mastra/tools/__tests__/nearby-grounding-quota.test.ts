import { beforeEach, describe, expect, it, vi } from "vitest";
import { incrementAndCheckGroundingQuota } from "../../lib/grounding-quota";
import { hasVerifiedNearbyRentalUser, searchNearbyRentalPlaces } from "../nearby-rental-places";
import { searchGroundedPlacesTool } from "../search-grounded-places";

vi.mock("../../lib/grounding-quota", () => ({
  incrementAndCheckGroundingQuota: vi.fn(),
}));
vi.mock("../nearby-rental-places", () => ({
  searchNearbyRentalPlaces: vi.fn(),
  hasVerifiedNearbyRentalUser: vi.fn(),
}));

const rentalId = "550e8400-e29b-41d4-a716-446655440000";
const input = {
  query: "Show cafés within 800 meters of this apartment",
  nearbyRentalId: rentalId,
  nearbyRadiusMeters: 800,
  intent: "cafe" as const,
};

/** Invoke the real grounded tool with its contextual Nearby input. */
function executeNearby() {
  const execute = searchGroundedPlacesTool.execute;
  if (!execute) throw new Error("grounded Places tool has no execute handler");
  return execute(input, {} as never);
}

describe("SAN-106 Nearby respects the canonical Places budget/kill switch", () => {
  beforeEach(() => {
    vi.mocked(incrementAndCheckGroundingQuota).mockReset();
    vi.mocked(searchNearbyRentalPlaces).mockReset();
    vi.mocked(hasVerifiedNearbyRentalUser).mockReset();
    vi.mocked(hasVerifiedNearbyRentalUser).mockResolvedValue(true);
  });

  it("rejects a guest/service/anonymous-context call before quota reservation or Places", async () => {
    vi.mocked(hasVerifiedNearbyRentalUser).mockResolvedValue(false);
    const out = await executeNearby();
    expect(hasVerifiedNearbyRentalUser).toHaveBeenCalledOnce();
    expect(incrementAndCheckGroundingQuota).not.toHaveBeenCalled();
    expect(searchNearbyRentalPlaces).not.toHaveBeenCalled();
    expect(out).toMatchObject({
      results: [],
      metadata: { searchMode: "nearby", reason: "authentication_required" },
    });
  });

  it("does not call the billable provider when quota is disabled", async () => {
    vi.mocked(incrementAndCheckGroundingQuota).mockResolvedValue({
      allowed: false, reason: "daily_quota_exceeded",
    } as never);
    const out = await executeNearby();
    expect(incrementAndCheckGroundingQuota).toHaveBeenCalledOnce();
    expect(searchNearbyRentalPlaces).not.toHaveBeenCalled();
    expect(out).toMatchObject({
      results: [],
      metadata: {
        searchMode: "nearby",
        anchorPinId: `rental-${rentalId}`,
        reason: "daily_quota_exceeded",
      },
    });
  });

  it("only calls Nearby once when the daily limit allows it", async () => {
    vi.mocked(incrementAndCheckGroundingQuota).mockResolvedValue({
      allowed: true,
    } as never);
    vi.mocked(searchNearbyRentalPlaces).mockResolvedValue({
      results: [], attribution: [], source: "grounding",
      metadata: { searchMode: "nearby", anchorPinId: `rental-${rentalId}`, venueKind: "cafe", radiusMeters: 800, provider: "google_places_nearby" },
    });
    await executeNearby();
    expect(incrementAndCheckGroundingQuota).toHaveBeenCalledOnce();
    expect(searchNearbyRentalPlaces).toHaveBeenCalledOnce();
    expect(searchNearbyRentalPlaces).toHaveBeenCalledWith(
      { rentalId, radiusMeters: 800, limit: 5 },
      expect.anything(),
    );
  });
});
