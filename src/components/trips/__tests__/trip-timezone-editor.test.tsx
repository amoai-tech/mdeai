// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TripTimezoneEditor } from "../trip-timezone-editor";

const { updateTripTimezone } = vi.hoisted(() => ({
  updateTripTimezone: vi.fn(async () => ({
    ok: true as const,
    timezone: "Asia/Tokyo",
  })),
}));

vi.mock("@/app/trips/actions", () => ({ updateTripTimezone }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("TripTimezoneEditor", () => {
  it("saves a valid IANA timezone and refreshes the trip", async () => {
    render(
      <TripTimezoneEditor tripId="11111111-1111-4111-8111-111111111111" timeZone="America/Bogota" />,
    );
    fireEvent.change(screen.getByTestId("trip-timezone-select"), {
      target: { value: "Asia/Tokyo" },
    });
    await waitFor(() =>
      expect(updateTripTimezone).toHaveBeenCalledWith({
        tripId: "11111111-1111-4111-8111-111111111111",
        timezone: "Asia/Tokyo",
      }),
    );
    expect(
      (screen.getByTestId("trip-timezone-select") as HTMLSelectElement).value,
    ).toBe("Asia/Tokyo");
  });
});
