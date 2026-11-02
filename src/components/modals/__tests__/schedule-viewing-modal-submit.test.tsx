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
vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect: (date: Date | undefined) => void }) => (
    <button type="button" data-testid="viewing-date-mock"
      onClick={() => onSelect(new Date('2099-06-01T12:00:00'))}>Select date</button>
  ),
}));

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
const nativeValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)?.set;

function setNativeValue(el: HTMLInputElement, value: string) {
  nativeValueSetter?.call(el, value);
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
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

async function renderModalAndFill() {
  // Flush the mount effect (contact prefill) before typing, otherwise a
  // signed-out prefill would clear the values we just entered.
  await act(async () => {
    root.render(<ScheduleViewingModal />);
  });
  await act(() => Promise.resolve());

  await act(() => {
    setNativeValue(
      container.querySelector('input[name="name"]') as HTMLInputElement,
      "Camila Test",
    );
    setNativeValue(
      container.querySelector('input[name="email"]') as HTMLInputElement,
      "camila@example.com",
    );
    (container.querySelector('[data-testid="viewing-date-trigger"]') as HTMLButtonElement).click();
    setNativeValue(container.querySelector('input[name="viewingTime"]') as HTMLInputElement, "15:00");
  });
  await act(() => {
    (container.querySelector('[data-testid="viewing-date-mock"]') as HTMLButtonElement).click();
  });
  await act(async () => {
    container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(container.querySelector('[data-testid="schedule-viewing-review"]')).not.toBeNull();
}

function submitForm() {
  const form = container.querySelector("form");
  if (!form) throw new Error("modal form not rendered");
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

describe("ScheduleViewingModal submit behaviour (SAN-1203)", () => {
  it("submits once when the form is submitted twice before the request settles", async () => {
    let resolveSubmit!: (_value: ScheduleViewingResult) => void;
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

  it("keeps the renter's details and offers recovery when the apartment cannot take a request", async () => {
    const { ScheduleViewingError: MockedError } = await import("@/lib/leads/submit-schedule-viewing");
    // The module is mocked with a bare `class extends Error`, so set the fields the modal reads.
    const unavailable = new (MockedError as unknown as new () => Error & {
      code: string;
      message: string;
    })();
    unavailable.code = "LISTING_UNAVAILABLE";
    unavailable.message =
      "This home isn't accepting viewing requests right now. Pick another apartment from the results.";
    vi.mocked(submitScheduleViewing).mockRejectedValue(unavailable);

    await renderModalAndFill();
    await act(() => {
      submitForm();
      return Promise.resolve();
    });

    // The message is shown, and so is a way forward.
    expect(container.querySelector('[data-testid="schedule-viewing-error"]')?.textContent).toContain(
      "isn't accepting viewing requests",
    );
    const recovery = container.querySelector('[data-testid="schedule-viewing-recovery"]');
    expect(recovery).not.toBeNull();

    // Nothing the renter typed was thrown away.
    expect(container.textContent).toContain("Camila Test");
    expect(container.textContent).toContain("camila@example.com");
    expect(container.querySelector('[data-testid="schedule-viewing-review"]')?.textContent).toContain("2099-06-01 at 15:00");

    // "Choose another apartment" is a real link to the results, so it needs no router and works
    // without JavaScript; clicking it closes the modal.
    const chooseAnother = container.querySelector(
      '[data-testid="schedule-viewing-choose-another"]',
    ) as HTMLAnchorElement;
    expect(chooseAnother.tagName).toBe("A");
    expect(chooseAnother.getAttribute("href")).toMatch(/^\/rentals/);
    // jsdom cannot navigate; prevent the default so the test can still assert the handler ran.
    chooseAnother.addEventListener("click", (event) => event.preventDefault(), { once: true });
    await act(() => {
      chooseAnother.click();
      return Promise.resolve();
    });
    expect(useRentalUi().closeScheduleViewing).toHaveBeenCalled();

    // "Refresh apartment" re-runs the request rather than reloading the page, so the typed
    // values survive a re-check.
    vi.mocked(submitScheduleViewing).mockClear();
    await act(() => {
      (container.querySelector('[data-testid="schedule-viewing-refresh"]') as HTMLButtonElement).click();
      return Promise.resolve();
    });
    expect(submitScheduleViewing).toHaveBeenCalledTimes(1);
  });

  it("does not carry one apartment's unavailable error onto the next apartment", async () => {
    const { ScheduleViewingError: MockedError } = await import("@/lib/leads/submit-schedule-viewing");
    const unavailable = new (MockedError as unknown as new () => Error & { code: string; message: string })();
    unavailable.code = "LISTING_UNAVAILABLE";
    unavailable.message = "This home isn't accepting viewing requests right now.";
    vi.mocked(submitScheduleViewing).mockRejectedValue(unavailable);

    await renderModalAndFill();
    await act(() => {
      submitForm();
      return Promise.resolve();
    });
    expect(container.querySelector('[data-testid="schedule-viewing-recovery"]')).not.toBeNull();

    // The renter gives up on this one and opens another apartment.
    vi.mocked(useRentalUi).mockReturnValue({
      scheduleTarget: { ...TARGET, listingId: "apt-otro-002", title: "Another Apartment" },
      closeScheduleViewing: vi.fn(),
      setLeadConfirmation: vi.fn(),
    } as unknown as ReturnType<typeof useRentalUi>);

    await act(() => {
      root.render(<ScheduleViewingModal />);
      return Promise.resolve();
    });

    // The previous apartment's failure must not follow the renter here.
    expect(container.querySelector('[data-testid="schedule-viewing-recovery"]')).toBeNull();
    expect(container.querySelector('[data-testid="schedule-viewing-error"]')).toBeNull();
  });

  it("shows no recovery action for an ordinary validation error", async () => {
    const { ScheduleViewingError: MockedError } = await import("@/lib/leads/submit-schedule-viewing");
    const invalid = new (MockedError as unknown as new () => Error & { code: string })();
    invalid.code = "VALIDATION_ERROR";
    invalid.message = "Please check your viewing details and try again.";
    vi.mocked(submitScheduleViewing).mockRejectedValue(invalid);

    await renderModalAndFill();
    await act(() => {
      submitForm();
      return Promise.resolve();
    });

    expect(container.querySelector('[data-testid="schedule-viewing-recovery"]')).toBeNull();
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
      container.textContent,
    ).toContain("Camila Test");
  });

  it("shows an unavailable-apartment error without closing or falsely confirming a viewing", async () => {
    vi.mocked(submitScheduleViewing).mockRejectedValue(
      new Error("This home isn't accepting viewing requests right now. Pick another apartment from the results."),
    );

    await renderModalAndFill();
    await act(async () => {
      submitForm();
    });

    expect(container.querySelector('[data-testid="schedule-viewing-modal"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="schedule-viewing-error"]')?.textContent,
    ).toContain("isn't accepting viewing requests");
    expect(
      container.textContent,
    ).toContain("Camila Test");
    const { setLeadConfirmation } = vi.mocked(useRentalUi).mock.results[0]
      .value as unknown as { setLeadConfirmation: ReturnType<typeof vi.fn> };
    expect(setLeadConfirmation).not.toHaveBeenCalled();
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
