import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlacesConfigError, PlacesRequestError } from "@/mastra/lib/google-places-client";

const { verifyPlaceId, createClient, redirect, supabaseClient, updates, draftRead } = vi.hoisted(() => {
  const updates: Record<string, unknown[]> = { landlord_profiles: [], apartments: [] };
  const draftRead: {
    data: { metadata: unknown } | null;
    error: { message: string } | null;
  } = { data: null, error: null };
  const supabaseClient = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
    rpc: vi.fn(async () => ({
      data: { apartment_id: "apt-1", landlord_profile_id: "lp-1" },
      error: null,
    })),
    from: vi.fn((table: string) => {
      const update = vi.fn((payload: unknown) => {
        (updates[table] ??= []).push(payload);
        return { eq: vi.fn(async () => ({ error: null })) };
      });
      const maybeSingle = vi.fn(async () => draftRead);
      const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
      return { update, select };
    }),
  };
  return {
    verifyPlaceId: vi.fn(),
    createClient: vi.fn(),
    redirect: vi.fn(),
    supabaseClient,
    updates,
    draftRead,
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
    updates.landlord_profiles.length = 0;
    updates.apartments.length = 0;
    draftRead.data = null;
    draftRead.error = null;
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
  it("returns new /app onboarding to its own listings after saving", async () => {
    verifyPlaceId.mockResolvedValue({
      formattedAddress: "Calle 10 #42-15, Laureles",
      latitude: 6.2447,
      longitude: -75.5916,
    });
    await submitBrokerOnboarding({ ...input, confirmedListingRights: false }, "app");
    expect(redirect).toHaveBeenCalledWith("/app/rentals/listings");
  });

  it("preserves the legacy listings destination", async () => {
    verifyPlaceId.mockResolvedValue({
      formattedAddress: "Calle 10 #42-15, Laureles",
      latitude: 6.2447,
      longitude: -75.5916,
    });
    await submitBrokerOnboarding(input);
    expect(redirect).toHaveBeenCalledWith("/host/rentals/listings");
  });


  const freeText = {
    ...input,
    address: "Carrera 70 #44-12",
    placeId: "",
    formattedAddress: "",
    latitude: null,
    longitude: null,
  };

  it("removes only the place keys from a reused draft's metadata", async () => {
    draftRead.data = {
      metadata: {
        place_id: "ChIJold",
        formatted_address: "Old address",
        address_source: "places_search",
        inventory_kind: "test_fixture",
        is_test_fixture: true,
        review_required_reason: "material edit after publication",
      },
    };
    await submitBrokerOnboarding(freeText);

    expect(redirect).toHaveBeenCalledWith("/host/rentals/listings");
    const patch = updates.apartments.at(-1) as Record<string, unknown>;
    expect(patch.latitude).toBeNull();
    expect(patch.longitude).toBeNull();
    expect(patch.metadata).toEqual({
      inventory_kind: "test_fixture",
      is_test_fixture: true,
      review_required_reason: "material edit after publication",
    });
  });

  it("leaves provenance metadata untouched when the draft has no place keys", async () => {
    draftRead.data = { metadata: { inventory_kind: "test_fixture" } };
    await submitBrokerOnboarding(freeText);

    const patch = updates.apartments.at(-1) as Record<string, unknown>;
    expect("metadata" in patch).toBe(false);
  });

  it("fails closed when the reused draft cannot be read", async () => {
    draftRead.error = { message: "permission denied" };
    const result = await submitBrokerOnboarding(freeText);

    expect(result).toEqual({ ok: false, message: "permission denied" });
    expect(updates.apartments).toHaveLength(0);
  });
});
