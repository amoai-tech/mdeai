// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  searchNearbyRental: vi.fn(),
}));

vi.mock("@/hooks/use-session", () => ({ useSession: mocks.useSession }));
vi.mock("@/hooks/use-grounded-search-fast-path", () => ({
  useGroundedSearchFastPath: () => ({ searchNearbyRental: mocks.searchNearbyRental }),
}));
vi.mock("@copilotkit/react-core/v2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@copilotkit/react-core/v2")>();
  return {
    ...actual,
    useAgent: () => ({ agent: { isRunning: false } }),
  };
});

import { NearbyRentalAction } from "../mde-ui-catalog";

const rental = {
  listingId: "550e8400-e29b-41d4-a716-446655440000",
  pinId: "rental-550e8400-e29b-41d4-a716-446655440000",
};

describe("SAN-106 nearby rental CTA session guard", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });
  it("does not offer billable Nearby to guests", () => {
    mocks.useSession.mockReturnValue({ user: null, loading: false });
    render(<NearbyRentalAction {...rental} />);
    expect(screen.queryByTestId("rental-nearby-cta")).toBeNull();
    expect(mocks.searchNearbyRental).not.toHaveBeenCalled();
  });

  it("hides the action while the session is unresolved", () => {
    mocks.useSession.mockReturnValue({ user: null, loading: true });
    render(<NearbyRentalAction {...rental} />);
    expect(screen.queryByTestId("rental-nearby-cta")).toBeNull();
  });

  it("does not offer Nearby to a temporary anonymous Supabase identity", () => {
    mocks.useSession.mockReturnValue({ user: { id: "temporary", is_anonymous: true }, loading: false });
    render(<NearbyRentalAction {...rental} />);
    expect(screen.queryByTestId("rental-nearby-cta")).toBeNull();
  });

  it("selects the real pin and searches the stored rental ID when clicked", async () => {
    mocks.useSession.mockReturnValue({ user: { id: "signed-in-renter" }, loading: false });
    mocks.searchNearbyRental.mockResolvedValue(true);
    const onSelect = vi.fn();
    render(<NearbyRentalAction {...rental} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Show nearby cafés" }));
    await waitFor(() => expect(mocks.searchNearbyRental).toHaveBeenCalledWith(rental.listingId));
    expect(onSelect).toHaveBeenCalledWith(rental.pinId);
  });

  it("shows the action for a signed-in user", () => {
    mocks.useSession.mockReturnValue({ user: { id: "signed-in-renter" }, loading: false });
    render(<NearbyRentalAction {...rental} />);
    expect(screen.getByRole("button", { name: "Show nearby cafés" })).toBeTruthy();
  });
});
