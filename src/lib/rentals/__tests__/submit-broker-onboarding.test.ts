import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlacesConfigError, PlacesRequestError } from "@/mastra/lib/google-places-client";

const { verifyPlaceId, createClient, redirect, supabaseClient } = vi.hoisted(() => {
  const supabaseClient = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
    rpc: vi.fn(async () => ({
      data: { apartment_id: "apt-1", landlord_profile_id: "lp-1" },
      error: null,
    })),
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    })),
  };
  return {
    verifyPlaceId: vi.fn(),
    createClient: vi.fn(),
    redirect: vi.fn(),
    supabaseClient,
  };
});

vi.mock("@/lib/place-search", () => ({ verifyPlaceId }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/navigation", () => ({ redirect }));

import { submitBrokerOnboarding } from "@/lib/rentals/submit-broker-onboarding";

const input = {
  displayName: "Broker",
  whatsapp: "",
  neighborhoods: ["Laureles"],
  address: "Calle 10",
  bedrooms: 2,
  bathrooms: 1,
  monthlyRentCop: 2_400_000,
  photoUrl: "",
  confirmedListingRights: true,
  placeId: "ChIJabc12345",
  formattedAddress: "Calle 10 #42-15, Laureles",
  latitude: 6.2447,
  longitude: -75.5916,
};

describe("submitBrokerOnboarding place verification branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockResolvedValue(supabaseClient);
  });

  it("maps PlacesConfigError to a temporary-unavailable message", async () => {
    verifyPlaceId.mockRejectedValue(new PlacesConfigError("missing key"));
    const result = await submitBrokerOnboarding(input);
    if (result.ok) throw new Error("expected a failure result");
    expect(result.message).toContain("temporarily unavailable");
  });

  it("maps PlacesRequestError to a Google-unreachable message", async () => {
    verifyPlaceId.mockRejectedValue(new PlacesRequestError("timeout"));
    const result = await submitBrokerOnboarding(input);
    if (result.ok) throw new Error("expected a failure result");
    expect(result.message).toContain("could not reach Google");
  });

  it("maps a not-found place to pick-again", async () => {
    verifyPlaceId.mockResolvedValue(null);
    const result = await submitBrokerOnboarding(input);
    if (result.ok) throw new Error("expected a failure result");
    expect(result.message).toContain("Pick it again");
  });

  it("fails closed on an unexpected provider error instead of throwing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    verifyPlaceId.mockRejectedValue(new Error("boom"));
    const result = await submitBrokerOnboarding(input);
    if (result.ok) throw new Error("expected a failure result");
    expect(result.message).toContain("temporarily unavailable");
    spy.mockRestore();
  });
});
