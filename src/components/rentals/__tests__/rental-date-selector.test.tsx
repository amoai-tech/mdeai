// @vitest-environment jsdom
/**
 * SAN-1611 — the calendar edits a DRAFT; only Apply commits; guests appear only with real capacity.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/rentals",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); },
}));

import { RentalDateSelector } from "@/components/rentals/rental-date-selector";

let container: HTMLDivElement;
let root: Root;
const byId = (id: string) => document.querySelector(`[data-testid="${id}"]`);

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

const render = (props: Partial<React.ComponentProps<typeof RentalDateSelector>> = {}) =>
  act(() =>
    root.render(
      <RentalDateSelector neighborhood={null} beds={null} from={null} through={null} {...props} />,
    ),
  );

const openDialog = async () =>
  act(async () => {
    (byId("rentals-dates-trigger") as HTMLElement).click();
  });

describe("RentalDateSelector — guest capacity", () => {
  it("shows no guest control when capacity is unknown (today's real data)", async () => {
    render();
    await openDialog();
    expect(byId("rental-date-guests")).toBeNull();
  });

  it("shows a bounded guest control only when a real capacity is supplied", async () => {
    render({ maxGuests: 4, initialGuests: 2 });
    await openDialog();
    const group = byId("rental-date-guests");
    expect(group).not.toBeNull();
    // 1..capacity: the decrement/increment are real controls, not a free-text field.
    expect(group?.querySelectorAll("button").length).toBe(2);
  });
});

describe("RentalDateSelector — AI suggestion is a draft", () => {
  it("opens the calendar with the suggested stay and never navigates", async () => {
    const handled = vi.fn();
    render({ suggestedStay: { from: "2026-11-12", through: "2026-11-18" }, onSuggestionHandled: handled });
    await act(async () => {});
    expect(byId("rentals-dates-dialog")).not.toBeNull();
    expect(document.body.textContent).toContain("Nov 12, 2026");
    // The suggestion opened a draft; it did not apply anything.
    expect(push).not.toHaveBeenCalled();
    expect(handled).toHaveBeenCalled();
  });
});

describe("RentalDateSelector — applied state", () => {
  it("labels the trigger with the applied stay", () => {
    render({ from: "2026-11-10", through: "2026-11-15" });
    const trigger = byId("rentals-dates-trigger");
    expect(trigger?.textContent).toContain("Nov 10, 2026");
    expect(trigger?.textContent).toContain("Nov 15, 2026");
    // Nothing is applied merely by rendering.
    expect(push).not.toHaveBeenCalled();
  });

  it("says Any dates when none are applied", () => {
    render();
    expect(byId("rentals-dates-trigger")?.textContent).toContain("Any dates");
  });
});

describe("RentalDateSelector — a suggestion can be offered again", () => {
  it("re-opens the calendar for the SAME suggestion after the owner clears it", async () => {
    const handled = vi.fn();
    const props = { neighborhood: null, beds: null, from: null, through: null } as const;

    // 1. Offer it: the draft opens.
    render({ ...props, suggestedStay: { from: "2026-11-12", through: "2026-11-18" }, onSuggestionHandled: handled });
    expect(byId("rentals-dates-dialog")).not.toBeNull();
    expect(handled).toHaveBeenCalled();

    // 2. The renter closes it without applying.
    await act(async () => { (byId("rentals-dates-cancel") as HTMLElement).click(); });
    expect(byId("rentals-dates-dialog")).toBeNull();
    expect(push).not.toHaveBeenCalled();

    // 3. The owner clears the suggestion once it has been handled.
    render({ ...props });

    // 4. The SAME suggestion arrives again: it must open, not be swallowed by the stale key.
    await act(async () => {
      root.render(
        <RentalDateSelector
          {...props}
          suggestedStay={{ from: "2026-11-12", through: "2026-11-18" }}
          onSuggestionHandled={vi.fn()}
        />,
      );
    });
    expect(byId("rentals-dates-dialog")).not.toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});
