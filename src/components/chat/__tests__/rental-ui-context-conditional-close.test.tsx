// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RentalUiProvider, useRentalUi } from "@/components/chat/rental-ui-context";

// Probe the real provider; mocking the close handler would miss the shared event checkout regression.
let current: ReturnType<typeof useRentalUi>;
let root: Root;
let container: HTMLDivElement;
function Probe() {
  const ui = useRentalUi();
  useEffect(() => { current = ui; }, [ui]);
  return null;
}
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<RentalUiProvider><Probe /></RentalUiProvider>));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("closeRentalDetails shares the venue slot safely", () => {
  it("closes a stale rental Details panel", () => {
    act(() => current.openVenueDetail({
      kind: "rental", listingId: "rental-2", pinId: "rental-rental-2",
      title: "Apartment two", neighborhood: "Laureles",
    }));
    expect(current.venueDetail?.kind).toBe("rental");
    act(() => current.closeRentalDetails());
    expect(current.venueDetail).toBeNull();
  });
  it("preserves an event checkout and its selected event", () => {
    act(() => current.openVenueDetail({
      kind: "event", eventId: "event-2", pinId: "event-event-2",
      title: "Salsa Event", neighborhood: "Laureles", venue: "Sala",
      startsAt: "2026-11-12T20:00:00-05:00", pricePerTicket: 10000,
      ticketUrl: "/events/salsa", step: "checkout",
    }));
    expect(current.venueDetail).toEqual(expect.objectContaining({kind: "event", step: "checkout"}));
    act(() => current.closeRentalDetails());
    expect(current.venueDetail).toEqual(expect.objectContaining({eventId: "event-2", kind: "event", step: "checkout"}));
  });
});
