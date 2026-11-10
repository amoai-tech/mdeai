// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MapPin } from "@/platform/contracts";
import { AddToTripButton } from "../add-to-trip-button";

const addTripItem = vi.hoisted(() => vi.fn());
const listTripOptions = vi.hoisted(() => vi.fn());

vi.mock("@/app/trips/actions", () => ({ addTripItem, listTripOptions }));

const pin: MapPin = {
  id: "rental-16ee9a7e-894f-4ca9-8ed5-54c36e442559",
  category: "rental",
  lat: 6.2220797,
  lng: -75.573502,
  title: "Plaza del Rio Apt 1805",
  source: "sql",
};

const trip = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Saturday",
  startDate: "2026-11-14",
  endDate: "2026-11-14",
};

describe("AddToTripButton", () => {
  it("does not stay stuck on Saving… when the server action rejects", async () => {
    listTripOptions.mockResolvedValue({ ok: true, trips: [trip] });
    addTripItem.mockRejectedValue(new Error("network down"));

    render(<AddToTripButton pin={pin} />);
    fireEvent.click(screen.getByTestId("selected-place-overlay-add-trip"));
    await screen.findByTestId("add-to-trip-select");
    fireEvent.change(screen.getByTestId("add-to-trip-select"), {
      target: { value: trip.id },
    });
    fireEvent.click(screen.getByTestId("add-to-trip-confirm"));

    expect(await screen.findByTestId("add-to-trip-error")).not.toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId("add-to-trip-confirm").textContent).toBe("Add to trip");
    });
    expect((screen.getByTestId("add-to-trip-confirm") as HTMLButtonElement).disabled).toBe(false);
  });

  it("handles a rejected trip-list request without an infinite loader", async () => {
    listTripOptions.mockRejectedValue(new Error("network down"));

    render(<AddToTripButton pin={pin} />);
    fireEvent.click(screen.getByTestId("selected-place-overlay-add-trip"));
    expect(
      await screen.findByText(/Could not load your trips/i),
    ).not.toBeNull();
    expect(screen.queryByText(/You need a trip first/i)).toBeNull();
    expect(screen.queryByText(/Loading your trips/i)).toBeNull();
  });

  it("shows an honest unknown-place rejection and keeps retry enabled", async () => {
    listTripOptions.mockResolvedValue({ ok: true, trips: [trip] });
    addTripItem.mockResolvedValue({
      ok: false,
      error: "This place is not in MDE's saved place catalog yet, so it cannot be added to a trip.",
    });

    render(<AddToTripButton pin={pin} />);
    fireEvent.click(screen.getByTestId("selected-place-overlay-add-trip"));
    await screen.findByTestId("add-to-trip-select");
    fireEvent.change(screen.getByTestId("add-to-trip-select"), {
      target: { value: trip.id },
    });
    fireEvent.click(screen.getByTestId("add-to-trip-confirm"));

    const error = await screen.findByTestId("add-to-trip-error");
    expect(error.textContent).toContain("not in MDE's saved place catalog");
    expect(screen.queryByTestId("add-to-trip-success")).toBeNull();
    expect((screen.getByTestId("add-to-trip-confirm") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows Done instead of Cancel after a successful save", async () => {
    listTripOptions.mockResolvedValue({ ok: true, trips: [trip] });
    addTripItem.mockResolvedValue({ ok: true, itemId: "22222222-2222-4222-8222-222222222222" });

    render(<AddToTripButton pin={pin} />);
    fireEvent.click(screen.getByTestId("selected-place-overlay-add-trip"));
    await screen.findByTestId("add-to-trip-select");
    fireEvent.change(screen.getByTestId("add-to-trip-select"), {
      target: { value: trip.id },
    });
    fireEvent.click(screen.getByTestId("add-to-trip-confirm"));

    expect(await screen.findByTestId("add-to-trip-success")).not.toBeNull();
    expect(screen.getByTestId("add-to-trip-done")).not.toBeNull();
  });
});
