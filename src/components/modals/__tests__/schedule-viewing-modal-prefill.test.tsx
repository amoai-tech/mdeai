// @vitest-environment jsdom
/**
 * SAN-1205 — the contact lookup must never erase what the renter already typed.
 *
 * The form looks up the signed-in user asynchronously after it opens. For a signed-out renter
 * that lookup resolves to "nobody", and the form used to respond by blanking name, email and
 * phone — including text typed while the lookup was still in flight. A fast typist on a slow
 * connection lost their name silently, and the live journey test hit it about one run in four.
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

type LookupUser = { email: string; user_metadata: { full_name: string } } | null;
let resolveLookup: ((_user: LookupUser) => void) | null = null;
let nextLookup: () => Promise<{ data: { user: LookupUser } }>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: () => nextLookup() },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
      }),
    }),
  }),
}));

import { useRentalUi } from "@/components/chat/rental-ui-context";
import { ScheduleViewingModal } from "@/components/modals/schedule-viewing-modal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TARGET = {
  listingId: "apt-laureles-001",
  title: "2BR Laureles Apartment",
  neighborhood: "Laureles",
};

const nativeValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)?.set;

function type(name: string, value: string) {
  const el = container.querySelector(`input[name="${name}"]`) as HTMLInputElement;
  nativeValueSetter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const field = (name: string) =>
  (container.querySelector(`input[name="${name}"]`) as HTMLInputElement).value;

let container: HTMLDivElement;
let root: Root;
let target: typeof TARGET | null;

function render() {
  vi.mocked(useRentalUi).mockReturnValue({
    scheduleTarget: target,
    closeScheduleViewing: vi.fn(),
    setLeadConfirmation: vi.fn(),
  } as unknown as ReturnType<typeof useRentalUi>);
  return act(async () => {
    root.render(<ScheduleViewingModal />);
  });
}

/** A lookup the test settles by hand, so typing can happen while it is still in flight. */
function pendingLookup() {
  nextLookup = () =>
    new Promise((resolve) => {
      resolveLookup = (user) => resolve({ data: { user } });
    });
}

beforeEach(() => {
  target = TARGET;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  resolveLookup = null;
  vi.clearAllMocks();
});

describe("ScheduleViewingModal contact lookup (SAN-1205)", () => {
  it("keeps what a signed-out renter typed while the lookup was still running", async () => {
    pendingLookup();
    await render();

    await act(() => {
      type("name", "Camila Test");
      type("email", "camila@example.com");
      type("phone", "+57 3000000000");
    });

    await act(async () => {
      resolveLookup?.(null); // nobody is signed in
    });

    expect(field("name")).toBe("Camila Test");
    expect(field("email")).toBe("camila@example.com");
    expect(field("phone")).toBe("+57 3000000000");
  });

  it("still clears a previous user's prefill when the next visitor is signed out", async () => {
    pendingLookup();
    await render();
    await act(async () => {
      resolveLookup?.({ email: "owner@example.com", user_metadata: { full_name: "Previous User" } });
    });
    expect(field("name")).toBe("Previous User");
    expect(field("email")).toBe("owner@example.com");

    // Close, then reopen for a visitor who is not signed in.
    target = null;
    await render();
    target = TARGET;
    pendingLookup();
    await render();
    await act(async () => {
      resolveLookup?.(null);
    });

    expect(field("name"), "a previous user's name must not leak").toBe("");
    expect(field("email"), "a previous user's email must not leak").toBe("");
  });
});
