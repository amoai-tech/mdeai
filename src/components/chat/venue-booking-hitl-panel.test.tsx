// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { VenueBookingHitlPanel, type VenueBookingHitlArgs } from "./venue-booking-hitl-panel";

const restaurantLookup = vi.hoisted(() => vi.fn(async () => ({ data: { name: "Verdeo" }, error: null })));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: restaurantLookup }) }) }) }),
}));
vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ user: { id: "qa-user" }, loading: false }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/restaurants" }));

const args: VenueBookingHitlArgs = {
  venueKind: "restaurant",
  restaurantId: "a1b2c3d4-e5f6-4789-abcd-100000000005",
  requestedAt: "2026-11-16T00:00:00.000Z",
  partySize: 2,
  contactName: "Maria",
  contactEmail: "maria@example.com",
  venueTitle: "Verdeo",
};

afterEach(() => { cleanup(); });

describe("HITL customer confirmation", () => {
  it("uses the actual restaurant name when the agent proposes only a canonical UUID", async () => {
    const respond = vi.fn(async () => {});
    render(<VenueBookingHitlPanel args={{ ...args, venueTitle: undefined }} status="executing" respond={respond} />);
    await waitFor(() => expect(screen.getByTestId("venue-booking-hitl-card").textContent).toContain("Venue: Verdeo"));
    expect(restaurantLookup).toHaveBeenCalledTimes(1);
  });
  it("does not forward a model-invented Place ID or venue title over a canonical restaurant UUID", async () => {
    const respond = vi.fn(async () => {});
    render(<VenueBookingHitlPanel args={{ ...args,
      placeId: "ChIJfakeID12345678901234", venueTitle: "Unverified Different Restaurant",
    }} status="executing" respond={respond} />);
    await waitFor(() => expect(screen.getByTestId("venue-booking-hitl-card").textContent).toContain("Venue: Verdeo"));
    fireEvent.click(screen.getByTestId("venue-booking-hitl-approve"));
    await waitFor(() => expect(respond).toHaveBeenCalledWith("approved", expect.objectContaining({
      restaurantId: args.restaurantId, placeId: undefined, venueTitle: "Verdeo",
    })));
  });

  it("shows Send, Edit and Cancel while awaiting consent", async () => {
    const respond = vi.fn(async () => {});
    render(<VenueBookingHitlPanel args={args} status="executing" respond={respond} />);
    expect(screen.getByTestId("venue-booking-hitl-approve")).toBeTruthy();
    expect(screen.getByText(/7:00 PM/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("venue-booking-hitl-reject"));
    await waitFor(() => expect(respond).toHaveBeenCalledWith("rejected", expect.objectContaining({
      restaurantId: args.restaurantId, requestedAt: args.requestedAt, partySize: 2,
      placeId: undefined,
    })));
    expect(respond).not.toHaveBeenCalledWith("approved", expect.anything());
  });
  it("edits and preserves draft before approval", async () => {
    const respond = vi.fn(async () => {});
    render(<VenueBookingHitlPanel args={args} status="executing" respond={respond} />);
    fireEvent.click(screen.getByTestId("venue-booking-hitl-edit"));
    fireEvent.change(screen.getByLabelText("Guests"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Done editing"));
    fireEvent.click(screen.getByTestId("venue-booking-hitl-approve"));
    await waitFor(() => expect(respond).toHaveBeenCalledWith(
      "approved", expect.objectContaining({ partySize: 3 }),
    ));
  });
  it("allows Retry with preserved draft after failed submit", async () => {
    const respond = vi.fn().mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(undefined);
    render(<VenueBookingHitlPanel args={args} status="executing" respond={respond} />);
    fireEvent.click(screen.getByTestId("venue-booking-hitl-approve"));
    await waitFor(() => expect(screen.getByTestId("venue-booking-hitl-error").textContent).toContain("Network unavailable"));
    fireEvent.click(screen.getByTestId("venue-booking-hitl-approve"));
    await waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
  });
  it("does not allow a second click while sending", async () => {
    let resolve!: () => void;
    const respond = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    render(<VenueBookingHitlPanel args={args} status="executing" respond={respond} />);
    fireEvent.click(screen.getByTestId("venue-booking-hitl-approve"));
    fireEvent.click(screen.getByTestId("venue-booking-hitl-approve"));
    expect(respond).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(); });
  });
});
