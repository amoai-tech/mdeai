// @vitest-environment jsdom
/**
 * SAN-1203 — interactive submit behaviour that static-markup tests cannot cover.
 *
 * The duplicate-submit lock is a synchronous ref guard: `setSubmitting(true)` is
 * async, so without it a fast double-click fires two requests before the button
 * disables. These tests render the real modal and drive real submit events.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/components/chat/rental-ui-context", () => ({ useRentalUi: vi.fn() }));
vi.mock("@/lib/leads/submit-schedule-viewing", () => ({
  submitScheduleViewing: vi.fn(),
  ScheduleViewingError: class extends Error {},
}));
vi.mock("@/lib/use-modal-a11y", () => ({ useModalA11y: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
      }),
    }),
  }),
}));

import { useRentalUi } from "@/components/chat/rental-ui-context";
import { submitScheduleViewing } from "@/lib/leads/submit-schedule-viewing";
import type { ScheduleViewingResult } from "@/lib/leads/schedule-viewing-schema";
import { ScheduleViewingModal } from "@/components/modals/schedule-viewing-modal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TARGET = {
  listingId: "apt-laureles-001",
  title: "2BR Laureles Apartment",
  neighborhood: "Laureles",
};

/** React tracks its own value, so drive the native setter then fire `input`. */
function setNativeValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.mocked(useRentalUi).mockReturnValue({
    scheduleTarget: TARGET,
    closeScheduleViewing: vi.fn(),
    setLeadConfirmation: vi.fn(),
  } as unknown as ReturnType<typeof useRentalUi>);

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function renderModalAndFill() {
  // Flush the mount effect (contact prefill) before typing, otherwise a
  // signed-out prefill would clear the values we just entered.
  await act(async () => {
    root.render(<ScheduleViewingModal />);
  });
  await act(async () => {});

  await act(async () => {
    setNativeValue(
      container.querySelector('input[name="name"]') as HTMLInputElement,
      "Camila Test",
    );
    setNativeValue(
      container.querySelector('input[name="email"]') as HTMLInputElement,
      "camila@example.com",
    );
    setNativeValue(
      container.querySelector('input[name="preferredAt"]') as HTMLInputElement,
      "2099-06-01T15:00",
    );
  });
}

function submitForm() {
  const form = container.querySelector("form");
  if (!form) throw new Error("modal form not rendered");
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

describe("ScheduleViewingModal submit behaviour (SAN-1203)", () => {
  it("submits once when the form is submitted twice before the request settles", async () => {
    let resolveSubmit: (value: ScheduleViewingResult) => void = () => {};
    vi.mocked(submitScheduleViewing).mockReturnValue(
      new Promise<ScheduleViewingResult>((resolve) => {
        resolveSubmit = resolve;
      }),
    );

    await renderModalAndFill();

    await act(async () => {
      submitForm();
      submitForm();
    });

    expect(submitScheduleViewing).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit({ leadId: "lead-1", showingId: "showing-1", message: "ok" });
    });
  });

  it("forwards the typed wall clock and the committed showing id", async () => {
    vi.mocked(submitScheduleViewing).mockResolvedValue({
      leadId: "lead-1",
      showingId: "showing-1",
      message: "Viewing request received — awaiting host confirmation.",
    });

    await renderModalAndFill();
    await act(async () => {
      submitForm();
    });

    expect(submitScheduleViewing).toHaveBeenCalledWith(
      expect.objectContaining({ preferredAt: "2099-06-01T15:00" }),
    );

    const { setLeadConfirmation } = vi.mocked(useRentalUi).mock.results[0]
      .value as unknown as { setLeadConfirmation: ReturnType<typeof vi.fn> };
    expect(setLeadConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead-1", showingId: "showing-1" }),
    );
  });

  it("keeps the modal open with a recoverable error when the backend fails", async () => {
    vi.mocked(submitScheduleViewing).mockRejectedValue(
      new Error("The viewing was not committed — please try again."),
    );

    await renderModalAndFill();
    await act(async () => {
      submitForm();
    });

    expect(container.querySelector('[data-testid="schedule-viewing-modal"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="schedule-viewing-error"]')?.textContent,
    ).toContain("not committed");
    // Typed values survive so the renter can retry without retyping.
    expect(
      (container.querySelector('input[name="name"]') as HTMLInputElement).value,
    ).toBe("Camila Test");
  });

  it("releases the lock after a failure so the renter can retry", async () => {
    vi.mocked(submitScheduleViewing).mockRejectedValueOnce(new Error("boom"));
    await renderModalAndFill();

    await act(async () => {
      submitForm();
    });
    await act(async () => {
      submitForm();
    });

    expect(submitScheduleViewing).toHaveBeenCalledTimes(2);
  });
});
