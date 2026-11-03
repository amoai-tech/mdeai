// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ loading: false, user: { id: "qa-renter" } }),
}));
vi.mock("@/components/chat/rental-ui-context", () => ({
  useRentalUi: () => ({ setVenueBookingConfirmation: vi.fn() }),
}));
vi.mock("@/components/ui/sheet", () => {
  const Container = ({ children, ...props }: { children?: ReactNode }) =>
    createElement("div", props, children);
  return {
    Sheet: Container,
    SheetContent: Container,
    SheetDescription: Container,
    SheetFooter: Container,
    SheetHeader: Container,
    SheetTitle: Container,
  };
});

import { RestaurantBookingSheet } from "./restaurant-booking-sheet";

describe("RestaurantBookingSheet — Phase A canonical UUID fallback", () => {
  it("renders the actual request form for an MDE restaurant without Google ID", () => {
    const html = renderToStaticMarkup(
      createElement(RestaurantBookingSheet, {
        target: {
          kind: "restaurant",
          pinId: "restaurant-verdeo",
          title: "Verdeo",
          restaurantId: "a1b2c3d4-e5f6-4789-abcd-100000000005",
        },
        open: true,
        onOpenChange: vi.fn(),
      }),
    );
    expect(html).toContain('data-testid="venue-booking-form"');
    expect(html).toContain("Send booking request");
    expect(html).not.toContain("restaurant-booking-missing-place-id");
  });

  it("does not invent a restaurant identity for an ungrounded result", () => {
    const html = renderToStaticMarkup(
      createElement(RestaurantBookingSheet, {
        target: { kind: "restaurant", pinId: "unresolved", title: "Unknown venue" },
        open: true,
        onOpenChange: vi.fn(),
      }),
    );
    expect(html).toContain("restaurant-booking-missing-place-id");
    expect(html).not.toContain('data-testid="venue-booking-form"');
  });
});
