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

describe("StartBookingReview — submitted payload (SAN-1611)", () => {
  let uuid = 0;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    uuid = 0;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => `0000-0000-0000-0000-00000000000${++uuid}` },
    });
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, booking: { id: "11111111-1111-4111-8111-111111111111" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const submit = async () => {
    const form = document.querySelector('[data-testid="booking-start-form"]') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  };

  const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body as string);

  it("sends the complete stay, not just a move-in date", async () => {
    act(() =>
      root.render(
        <StartBookingReview
          apartmentId={APARTMENT}
          defaultStartDate="2026-11-10"
          defaultEndDate="2026-11-16"
        />,
      ),
    );
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("/api/rentals/bookings");
    expect(bodyOf(0)).toMatchObject({
      apartmentId: APARTMENT,
      startDate: "2026-11-10",
      endDate: "2026-11-16",
    });
    expect(bodyOf(0).idempotencyKey).toEqual(expect.any(String));
  });

  it("reuses the same key when the same stay is retried", async () => {
    act(() =>
      root.render(
        <StartBookingReview apartmentId={APARTMENT} defaultStartDate="2026-11-10" defaultEndDate="2026-11-16" />,
      ),
    );
    await submit();
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // A retry must resume the same booking, so the key is stable for the same stay.
    expect(bodyOf(1).idempotencyKey).toBe(bodyOf(0).idempotencyKey);
  });

  it("starts a new intent when the stay changes, instead of colliding on a stale key", async () => {
    act(() =>
      root.render(
        <StartBookingReview apartmentId={APARTMENT} defaultStartDate="2026-11-10" defaultEndDate="2026-11-16" />,
      ),
    );
    await submit();
    const endInput = byId("booking-start-end-date")!;
    await act(async () => {
      // A controlled React input keeps its own value tracker, so set through the native setter
      // or React discards the change and re-renders the old value.
      const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setValue.call(endInput, "2026-11-20");
      endInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(1).endDate).toBe("2026-11-20");
    expect(bodyOf(1).idempotencyKey).not.toBe(bodyOf(0).idempotencyKey);
  });
});
