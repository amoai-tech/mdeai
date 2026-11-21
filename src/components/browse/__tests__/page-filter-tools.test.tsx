// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

type Captured = {
  name: string;
  followUp: boolean;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};
const state = vi.hoisted(() => ({
  tool: null as Captured | null,
  push: vi.fn(),
  subscriber: null as null | {
    onRunInitialized?: () => void;
    onRunFinalized?: () => void;
    onRunFailed?: () => void;
  },
  agent: {
    threadId: "thread-a",
    subscribe: vi.fn((subscriber: {
      onRunInitialized?: () => void;
      onRunFinalized?: () => void;
      onRunFailed?: () => void;
    }) => {
      state.subscriber = subscriber;
      return { unsubscribe: vi.fn() };
    }),
  },
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  useFrontendTool: (tool: Captured) => { state.tool = tool; },
}));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useOptionalConciergeCoAgent: () => ({ isReady: true, agent: state.agent }),
}));
vi.mock("@/lib/deterministic-e2e", () => ({ isDeterministicE2E: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));

import { EventPageControlTool, RentalPageControlTool } from "@/components/browse/page-filter-tools";
import { EventBrowseFilters } from "@/components/events/event-browse-filters";
import type { EventBrowseFilterState } from "@/lib/events/browse-url";

afterEach(() => { cleanup(); state.tool = null; state.subscriber = null; state.push.mockClear(); state.agent.subscribe.mockClear(); });

function tool(): Captured {
  if (!state.tool) throw new Error("page tool not registered");
  return state.tool;
}

describe("page filter tools", () => {
  it("registers the rental page action and updates the existing URL", async () => {
    render(<RentalPageControlTool filters={{ neighborhood: "Laureles", beds: "2", from: null, through: null }} />);
    await waitFor(() => expect(state.tool).not.toBeNull());
    expect(tool().name).toBe("updateRentalBrowseFilters");
    expect(tool().followUp).toBe(false);
    await tool().handler({ beds: "1" });
    expect(state.push).toHaveBeenCalledWith("/rentals?neighborhood=Laureles&beds=1");
    state.push.mockClear();
    const invalid = await tool().handler({ beds: "4" });
    expect(invalid).toMatchObject({ ok: false });
    expect(state.push).not.toHaveBeenCalled();
  });

  it("registers the event page action and preserves untouched filters", async () => {
    render(<EventPageControlTool filters={{ category: "music", neighborhood: "Laureles", dateWindow: "this_weekend", price: null }} />);
    await waitFor(() => expect(state.tool).not.toBeNull());
    expect(tool().name).toBe("updateEventBrowseFilters");
    await tool().handler({ dateWindow: "next_week" });
    expect(state.push).toHaveBeenCalledWith(
      "/events?category=music&neighborhood=Laureles&dateWindow=next_week",
    );
  });

  it("rejects a late rental tool result after the renter changes the native filter", async () => {
    const { rerender } = render(
      <RentalPageControlTool filters={{ neighborhood: "Laureles", beds: "1", from: null, through: null }} />,
    );
    expect(state.subscriber?.onRunInitialized).toBeDefined();
    act(() => { state.subscriber?.onRunInitialized?.(); });
    // The browser's native 2-bedroom Link committed a newer URL before the AI replied.
    rerender(<RentalPageControlTool filters={{ neighborhood: "Laureles", beds: "2", from: null, through: null }} />);
    const rejected = await tool().handler({ beds: "1" });
    expect(rejected).toMatchObject({ ok: false });
    expect(state.push).not.toHaveBeenCalled();
    // A new chat run starts after the manual edit; this new instruction is allowed.
    act(() => { state.subscriber?.onRunInitialized?.(); });
    expect(await tool().handler({ neighborhood: "Envigado" })).toMatchObject({ ok: true, status: "navigation_requested" });
    expect(state.push).toHaveBeenCalledWith("/rentals?neighborhood=Envigado&beds=2");
  });

  it("protects a native filter click before the server has returned the new URL state", async () => {
    render(<RentalPageControlTool filters={{ neighborhood: "Laureles", beds: "1", from: null, through: null }} />);
    act(() => { state.subscriber?.onRunInitialized?.(); });
    const container = document.createElement("div");
    container.dataset.testid = "workspace-filters";
    const link = document.createElement("a");
    link.href = "/rentals?neighborhood=Laureles&beds=2";
    link.addEventListener("click", (event) => event.preventDefault());
    container.appendChild(link);
    document.body.appendChild(container);
    try {
      fireEvent.click(link);
      // The new page props are still pending when the older agent tool arrives.
      const rejected = await tool().handler({ beds: "1" });
      expect(rejected).toMatchObject({ ok: false });
      expect(state.push).not.toHaveBeenCalled();
    } finally {
      container.remove();
    }
  });

  const musicFilters = { category: "music" as const, neighborhood: null, dateWindow: "this_weekend" as const, price: null };

  function eventFixture(filters: Required<EventBrowseFilterState>) {
    return (
      <>
        <EventPageControlTool filters={filters} />
        {/* Real production composition: Events filterBar inside DiscoveryWorkspace. */}
        <div data-testid="workspace-filters">
          <EventBrowseFilters {...filters} />
        </div>
      </>
    );
  }

  function renderRealEventFilterMarkup() {
    const mounted = render(eventFixture(musicFilters));
    const chip = mounted.getByTestId("events-filter-category-nightlife");
    // Keep navigation pending; do not let jsdom navigate away to another page.
    chip.addEventListener("click", (event) => event.preventDefault());
    expect(chip.closest('[data-testid="workspace-filters"]')).not.toBeNull();
    expect(chip.closest('[data-testid="events-filters"]')).not.toBeNull();
    return { ...mounted, chip };
  }

  it("rejects a stale Event tool after clicking a REAL nested Events filter chip", async () => {
    const { chip } = renderRealEventFilterMarkup();
    act(() => { state.subscriber?.onRunInitialized?.(); });
    fireEvent.click(chip);
    const rejected = await tool().handler({ category: "music" });
    expect(rejected).toMatchObject({ ok: false });
    expect(state.push).not.toHaveBeenCalled();
  });

  it("keeps a newer Events click when a delayed agent run-start arrives before URL props", async () => {
    const mounted = renderRealEventFilterMarkup();
    const { chip } = mounted;
    // User sent an Ask turn earlier; the network has not emitted RUN_STARTED yet.
    // The user now navigates to Nightlife while the current URL still says Music.
    fireEvent.click(chip);
    act(() => { state.subscriber?.onRunInitialized?.(); });
    // A late tool for the old Music turn must NOT reset the newer human click.
    const rejected = await tool().handler({ category: "music" });
    expect(rejected).toMatchObject({ ok: false });
    expect(state.push).not.toHaveBeenCalled();
    // After native navigation is reflected in the real URL-backed filter props,
    // a NEW user Ask run is allowed to change the page again.
    const nextFilters = { ...musicFilters, category: "nightlife" as const };
    const { rerender } = mounted;
    rerender(eventFixture(nextFilters));
    act(() => { state.subscriber?.onRunInitialized?.(); });
    const accepted = await tool().handler({ dateWindow: "next_week" });
    expect(accepted).toMatchObject({ ok: true, status: "navigation_requested" });
    expect(state.push).toHaveBeenCalledWith("/events?category=nightlife&dateWindow=next_week");
  });

  it("does not treat opening an Events filter in a new tab as changing this page", async () => {
    const { chip } = renderRealEventFilterMarkup();
    act(() => { state.subscriber?.onRunInitialized?.(); });
    fireEvent.click(chip, { ctrlKey: true });
    expect(await tool().handler({ category: "food" })).toMatchObject({
      ok: true, status: "navigation_requested",
    });
    expect(state.push).toHaveBeenCalledWith("/events?category=food&dateWindow=this_weekend");
  });

  it("does not lock Ask MDE when an active Any date chip navigates to the same URL", async () => {
    const previous = window.location.href;
    window.history.replaceState(null, "", "/events");
    try {
      const emptyFilters: Required<EventBrowseFilterState> = {
        category: null, neighborhood: null, dateWindow: null, price: null,
      };
      const mounted = render(eventFixture(emptyFilters));
      const any = mounted.getByTestId("events-filter-date-any");
      expect(any.getAttribute("href")).toBe("/events");
      any.addEventListener("click", (event) => event.preventDefault());
      fireEvent.click(any);
      act(() => { state.subscriber?.onRunInitialized?.(); });
      expect(await tool().handler({ category: "music" })).toMatchObject({
        ok: true, status: "navigation_requested",
      });
      expect(state.push).toHaveBeenCalledWith("/events?category=music");
    } finally {
      window.history.replaceState(null, "", previous);
    }
  });

  it("keeps slow pending navigation protected even after more than five seconds", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      const { chip } = renderRealEventFilterMarkup();
      fireEvent.click(chip);
      clock.mockReturnValue(12001);
      act(() => { state.subscriber?.onRunInitialized?.(); });
      expect(await tool().handler({ category: "music" })).toMatchObject({ ok: false });
      expect(state.push).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });

  it("releases abandoned filter navigation after the old agent run finalizes", async () => {
    const { chip } = renderRealEventFilterMarkup();
    fireEvent.click(chip);
    act(() => { state.subscriber?.onRunInitialized?.(); });
    expect(await tool().handler({ category: "music" })).toMatchObject({ ok: false });
    act(() => { state.subscriber?.onRunFinalized?.(); });
    act(() => { state.subscriber?.onRunInitialized?.(); });
    expect(await tool().handler({ category: "food" })).toMatchObject({
      ok: true, status: "navigation_requested",
    });
    expect(state.push).toHaveBeenCalledWith("/events?category=food&dateWindow=this_weekend");
  });

  it("keeps a user's cleared Events filters when an older tool tries to restore them", async () => {
    const { rerender } = render(
      <EventPageControlTool filters={{ category: "music", neighborhood: null, dateWindow: "this_weekend", price: "paid" }} />,
    );
    act(() => { state.subscriber?.onRunInitialized?.(); });
    rerender(<EventPageControlTool filters={{ category: null, neighborhood: null, dateWindow: null, price: null }} />);
    const rejected = await tool().handler({ category: "music", price: "paid" });
    expect(rejected).toMatchObject({ ok: false });
    expect(state.push).not.toHaveBeenCalled();
  });

  it("rejects malformed Events inputs without navigation or false success", async () => {
    render(<EventPageControlTool filters={{ category: null, neighborhood: null, dateWindow: null, price: null }} />);
    const invalid = await tool().handler({ category: "salsa", price: "paid" });
    expect(invalid).toMatchObject({ ok: false });
    expect(state.push).not.toHaveBeenCalled();
  });
});
