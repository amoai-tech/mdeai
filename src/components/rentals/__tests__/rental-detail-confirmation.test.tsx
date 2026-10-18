// @vitest-environment jsdom
/**
 * SAN-1203 follow-up — after a viewing request is saved on the rental detail page, the renter
 * must SEE that it was received.
 *
 * The confirmation banner used to be mounted only inside the chat screen. On `/rentals/[id]` the
 * modal closed after a successful request and nothing replaced it, so the renter could not tell
 * whether it worked. This drives the real page, real modal and real shared state; only the
 * network call and the Supabase prefill are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";

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

import { submitScheduleViewing } from "@/lib/leads/submit-schedule-viewing";
import { RentalDetailView } from "@/components/rentals/rental-detail-view";
import { mapApartmentRowToDetail } from "@/lib/rentals/get-rental-detail";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const detail = mapApartmentRowToDetail({
  id: "d1000000-0000-4000-a000-000000000002",
  title: "Envigado Modern Tower · 2BR",
  neighborhood: "Envigado",
  bedrooms: 2,
  price_monthly: 1700,
  currency: "USD",
  status: "active",
  moderation_status: "approved",
  listing_workflow_status: "published",
  landlord_id: "landlord-1",
  // SAN-1502: the database's computed requestability decides the CTA.
  rental_can_request_viewing: true,
  // A known move-in date, as the viewing RPC requires (SAN-486); without one the page offers no viewing.
  available_from: "2000-01-01",
});

const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
function setNativeValue(el: HTMLInputElement, value: string) {
  nativeValueSetter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

let container: HTMLDivElement;
let root: Root;
const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function requestViewing() {
  await act(async () => {
    root.render(<RentalDetailView detail={detail} />);
  });
  await act(() => Promise.resolve());
  const open = Array.from(document.querySelectorAll("button")).find((b) =>
    /request viewing/i.test(b.textContent ?? ""),
  );
  expect(open).toBeTruthy();
  await act(async () => {
    open!.click();
  });
  const modal = document.querySelector('[data-testid="schedule-viewing-modal"]');
  expect(modal).toBeTruthy();
  await act(() => Promise.resolve());
  await act(() => {
    setNativeValue(document.querySelector('input[name="name"]') as HTMLInputElement, "Camila Test");
    setNativeValue(document.querySelector('input[name="email"]') as HTMLInputElement, "camila@example.invalid");
    setNativeValue(document.querySelector('input[name="preferredAt"]') as HTMLInputElement, "2099-01-02T15:00");
  });
  await act(async () => {
    (document.querySelector("form") as HTMLFormElement).requestSubmit();
  });
  await act(() => Promise.resolve());
}

describe("rental detail page — first-interaction hydration safety", () => {
  it("renders request controls disabled in server HTML until event handlers are attached", () => {
    const html = renderToString(<RentalDetailView detail={detail} />);
    // Parse SSR button markup using a fixed regex. Building a RegExp from
    // interpolated strings is unnecessary in a regression test and triggers
    // Codacy's dynamic-regex/XSS rules.
    const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(([markup]) => markup);
    for (const testId of ["rental-detail-request-cta", "rental-detail-request-cta-mobile"]) {
      const markup = buttons.find((button) => button.includes('data-testid="' + testId + '"'));
      expect(markup, testId + ' should be present in server HTML').toBeDefined();
      expect(markup).toContain("disabled");
    }
    // SAN-479 removed the "Ask a question" button (it opened the viewing form, which is misleading).
    expect(buttons.some((button) => button.includes('data-testid="rental-detail-ask-cta"'))).toBe(false);
  });

  it("enables the viewing button when hydrated, without any business approval", async () => {
    await act(async () => {
      root.render(<RentalDetailView detail={detail} />);
    });
    const cta = document.querySelector('[data-testid="rental-detail-request-cta-mobile"]') as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
    await act(async () => { cta.click(); });
    expect(document.querySelector('[data-testid="schedule-viewing-modal"]')).toBeTruthy();
  });
});

describe("rental detail page — viewing confirmation", () => {
  it("shows 'Viewing request received' after a saved request, and closes the form", async () => {
    vi.mocked(submitScheduleViewing).mockResolvedValue({
      leadId: "11111111-2222-3333-4444-555555555555",
      showingId: "66666666-7777-8888-9999-000000000000",
      message: "Viewing request received — awaiting host confirmation.",
    });
    await requestViewing();

    expect(document.querySelector('[data-testid="schedule-viewing-modal"]')).toBeNull();
    const banner = document.querySelector('[data-testid="lead-confirmation-card"]');
    expect(banner).toBeTruthy();
    expect(banner!.textContent).toContain("Viewing request received");
    expect(banner!.textContent).toContain("awaiting host confirmation");
    expect(banner!.textContent).toContain("Envigado Modern Tower");
    expect(banner!.getAttribute("data-showing-id")).toBe("66666666-7777-8888-9999-000000000000");
  });

  const saved = {
    leadId: "11111111-2222-3333-4444-555555555555",
    showingId: "66666666-7777-8888-9999-000000000000",
    message: "Viewing request received — awaiting host confirmation.",
  };

  it("scrolls the confirmation itself into view, because the renter is lower down the page", async () => {
    vi.mocked(submitScheduleViewing).mockResolvedValue(saved);
    await requestViewing();
    const banner = document.querySelector('[data-testid="lead-confirmation-card"]');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(banner); // the banner, not some other element
    expect(scrollIntoView.mock.calls[0][0]).toMatchObject({ behavior: "smooth" });
  });

  it("moves keyboard focus to the confirmation, not back to the button below it", async () => {
    vi.mocked(submitScheduleViewing).mockResolvedValue(saved);
    await requestViewing();
    expect(document.activeElement).toBe(document.querySelector('[data-testid="lead-confirmation-card"]'));
  });

  it("does not animate the scroll for renters who asked for reduced motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: /reduce/.test(query), media: query }));
    try {
      vi.mocked(submitScheduleViewing).mockResolvedValue(saved);
      await requestViewing();
      expect(scrollIntoView.mock.calls[0][0]).toMatchObject({ behavior: "auto" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows NO confirmation when the request failed, and keeps the form open", async () => {
    vi.mocked(submitScheduleViewing).mockRejectedValue(new Error("We couldn't send your viewing request. Please try again."));
    await requestViewing();

    expect(document.querySelector('[data-testid="lead-confirmation-card"]')).toBeNull();
    expect(document.querySelector('[data-testid="schedule-viewing-modal"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="schedule-viewing-error"]')).toBeTruthy();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("rental detail page — a listing with no move-in date", () => {
  it("offers no 'Request viewing' action, matching the viewing RPC", async () => {
    const undated = mapApartmentRowToDetail({
      id: "d1000000-0000-4000-a000-000000000009",
      title: "Undated Listing",
      neighborhood: "Laureles",
      bedrooms: 1,
      price_monthly: 1200,
      currency: "USD",
      status: "active",
      moderation_status: "approved",
      listing_workflow_status: "published",
      landlord_id: "landlord-1",
      available_from: null,
    });
    expect(undated.canScheduleViewing).toBe(false);
    await act(async () => {
      root.render(<RentalDetailView detail={undated} />);
    });
    const open = Array.from(document.querySelectorAll("button")).find((b) =>
      /request viewing/i.test(b.textContent ?? ""),
    );
    expect(open).toBeUndefined();
  });
});
