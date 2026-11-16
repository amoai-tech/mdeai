// @vitest-environment jsdom
/**
 * SAN-1658 — an AI viewing proposal seeds the native review form once; the
 * renter's own edits then win, and Cancel writes nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/rentals",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/chat/rental-ui-context", () => ({ useRentalUi: vi.fn() }));
const submit = vi.fn();
vi.mock("@/lib/leads/submit-schedule-viewing", () => ({
  submitScheduleViewing: (...args: unknown[]) => submit(...args),
  ScheduleViewingError: class extends Error {},
}));
vi.mock("@/lib/use-modal-a11y", () => ({ useModalA11y: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
  }),
}));

import { useRentalUi } from "@/components/chat/rental-ui-context";
import { ScheduleViewingModal } from "@/components/modals/schedule-viewing-modal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
type Target = { listingId: string; title: string; neighborhood: string; preferredAt?: string } | null;

let container: HTMLDivElement;
let root: Root;
const close = vi.fn();

async function render(target: Target) {
  vi.mocked(useRentalUi).mockReturnValue({
    scheduleTarget: target,
    closeScheduleViewing: close,
    setLeadConfirmation: vi.fn(),
  } as never);
  await act(async () => root.render(<ScheduleViewingModal />));
}
const time = () => container.querySelector<HTMLInputElement>('[data-testid="viewing-time"]')!;
const selected = () => container.querySelector('[data-testid="viewing-date-selection"]')!.textContent;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  submit.mockReset();
  close.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const base = { listingId: "apt-1", title: "Bright 2BR", neighborhood: "Laureles" };

describe("ScheduleViewingModal proposal seed", () => {
  it("opens with the proposal's edited date and time prefilled", async () => {
    await render({ ...base, preferredAt: `${future}T16:00` });
    expect(time().value).toBe("16:00");
    expect(selected()).toContain(future);
  });

  it("ignores an invalid proposal instead of seeding a broken draft", async () => {
    await render({ ...base, preferredAt: "2026-02-30T10:00" });
    expect(time().value).toBe("");
    expect(selected()).toMatch(/no date selected/i);
  });

  it("keeps the renter's edit when the same apartment re-renders with the original proposal", async () => {
    await render({ ...base, preferredAt: `${future}T16:00` });
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(time(), "17:45");
      time().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await render({ ...base, preferredAt: `${future}T16:00` });
    expect(time().value).toBe("17:45");
  });

  it("Cancel closes the modal and writes nothing", async () => {
    await render({ ...base, preferredAt: `${future}T16:00` });
    const cancel = [...container.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!;
    await act(async () => cancel.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(close).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });
});
