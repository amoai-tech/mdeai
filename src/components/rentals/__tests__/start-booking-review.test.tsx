// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartBookingReview } from "../start-booking-review";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const APARTMENT = "7beb9ede-f253-4f24-baeb-ae10a7c93a9d";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  push.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const byId = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLInputElement | null;

describe("StartBookingReview — SAN-1611 stay handoff", () => {
  it("prefills the move-in and move-out the renter already applied", () => {
    act(() =>
      root.render(
        <StartBookingReview
          apartmentId={APARTMENT}
          defaultStartDate="2026-11-10"
          defaultEndDate="2026-11-15"
        />,
      ),
    );
    expect(byId("booking-start-date")?.value).toBe("2026-11-10");
    expect(byId("booking-start-end-date")?.value).toBe("2026-11-15");
  });

  it("shows no move-out field when the renter only chose a move-in date", () => {
    act(() => root.render(<StartBookingReview apartmentId={APARTMENT} defaultStartDate="2026-11-10" />));
    expect(byId("booking-start-date")?.value).toBe("2026-11-10");
    expect(byId("booking-start-end-date")).toBeNull();
  });

  it("never invents a date when the stay was not carried", () => {
    act(() => root.render(<StartBookingReview apartmentId={APARTMENT} />));
    expect(byId("booking-start-date")?.value).toBe("");
    expect(byId("booking-start-end-date")).toBeNull();
  });
});
