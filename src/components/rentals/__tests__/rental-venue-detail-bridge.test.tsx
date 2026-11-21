// @vitest-environment jsdom
/** F8 — Details on an AI-shown card must open the Rentals page's own Details. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/chat/rental-ui-context", () => ({ useRentalUi: vi.fn() }));

import { useRentalUi } from "@/components/chat/rental-ui-context";
import { RentalVenueDetailBridge } from "../rental-venue-detail-bridge";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rows = [{ id: "a" }, { id: "b" }] as never[];
let container: HTMLDivElement;
let root: Root;
const close = vi.fn();
const open = vi.fn();

const render = (venueDetail: unknown) => {
  vi.mocked(useRentalUi).mockReturnValue({ venueDetail, closeVenueDetail: close } as never);
  return act(async () => root.render(<RentalVenueDetailBridge results={rows} openDetailsFor={open} />));
};

beforeEach(() => {
  push.mockReset(); close.mockReset(); open.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("RentalVenueDetailBridge", () => {
  it("opens the page's Details for the exact requested apartment, once", async () => {
    await render({ kind: "rental", listingId: "b" });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(rows[1]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("sends an apartment this page is not showing to its canonical details page", async () => {
    await render({ kind: "rental", listingId: "zzz/1" });
    expect(open).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/rentals/zzz%2F1");
  });

  it("ignores events and an empty request", async () => {
    await render({ kind: "event", eventId: "e" });
    await render(null);
    expect(open).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
