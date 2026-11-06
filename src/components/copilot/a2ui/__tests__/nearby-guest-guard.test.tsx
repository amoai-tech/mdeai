import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
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
  it("does not offer billable Nearby to guests", () => {
    mocks.useSession.mockReturnValue({ user: null, loading: false });
    const html = renderToStaticMarkup(<NearbyRentalAction {...rental} />);
    expect(html).not.toContain("rental-nearby-cta");
    expect(mocks.searchNearbyRental).not.toHaveBeenCalled();
  });

  it("hides the action while the session is unresolved", () => {
    mocks.useSession.mockReturnValue({ user: null, loading: true });
    expect(renderToStaticMarkup(<NearbyRentalAction {...rental} />)).not.toContain("rental-nearby-cta");
  });

  it("shows the action for a signed-in user", () => {
    mocks.useSession.mockReturnValue({ user: { id: "signed-in-renter" }, loading: false });
    expect(renderToStaticMarkup(<NearbyRentalAction {...rental} />)).toContain('data-testid="rental-nearby-cta"');
  });
});
