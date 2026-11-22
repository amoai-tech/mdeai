// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Rental } from "@/mastra/tools/search-rentals";

const state = vi.hoisted(() => ({
  handlers: {} as Record<string, (args: { listingId: string }) => unknown>,
}));

vi.mock("@copilotkit/react-core/v2/generative-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@copilotkit/react-core/v2/generative-ui")>();
  return {
    ...actual,
    useGenerativeUIFunction: (_ui: unknown, name: string, handler: (args: { listingId: string }) => unknown) => {
      state.handlers[name] = handler;
    },
  };
});

import { currentComparedRental, RentalComparisonPageActions } from "../rental-comparison-page-actions";

const current = [
  { id: "a", title: "Current first", tags: [] },
  { id: "b", title: "Current second", tags: ["external-source", "not-verified"] },
] as Rental[];

beforeEach(() => { state.handlers = {}; });

describe("official CopilotKit comparison Button IDs", () => {
  it("resolves only the currently visible authorized rental rows", () => {
    expect(currentComparedRental(current, "b")?.title).toBe("Current second");
    expect(currentComparedRental(current, "B")).toBeNull();
    expect(currentComparedRental(current, "stale")).toBeNull();
    expect(currentComparedRental([], "a")).toBeNull();
  });

  it("shows a status message when a stale listing ID is clicked", () => {
    const openDetails = vi.fn();
    render(<RentalComparisonPageActions results={current} onOpenDetails={openDetails} onScheduleViewing={vi.fn()} />);
    let result: unknown;
    act(() => { result = state.handlers.openComparedRentalDetails({ listingId: "stale" }); });
    expect(result).toMatchObject({ ok: false });
    expect(openDetails).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("no longer in the current results");

    act(() => { result = state.handlers.openComparedRentalDetails({ listingId: "a" }); });
    expect(result).toMatchObject({ ok: true });
    expect(openDetails).toHaveBeenCalledWith(current[0]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the stale comparison error after current results change", () => {
    const openDetails = vi.fn();
    const openViewing = vi.fn();
    const view = render(<RentalComparisonPageActions results={current} onOpenDetails={openDetails} onScheduleViewing={openViewing} />);
    view.rerender(<RentalComparisonPageActions results={[current[1]]} onOpenDetails={openDetails} onScheduleViewing={openViewing} />);
    let result: unknown;
    act(() => { result = state.handlers.openComparedRentalDetails({ listingId: "a" }); });
    expect(result).toMatchObject({ ok: false });
    expect(screen.getByRole("status").textContent).toContain("no longer in the current results");
    expect(openDetails).not.toHaveBeenCalled();
  });

  it("explains a preview without a persisted viewing target, but permits normal development records", () => {
    const openViewing = vi.fn();
    const preview = { id: "preview", title: "Source-only preview", tags: ["dev-preview"] } as Rental;
    render(<RentalComparisonPageActions results={[...current, preview]} onOpenDetails={vi.fn()} onScheduleViewing={openViewing} />);
    let result: unknown;
    act(() => { result = state.handlers.requestComparedRentalViewing({ listingId: "preview" }); });
    expect(result).toMatchObject({ ok: false });
    expect(screen.getByRole("status").textContent).toContain("no saved apartment record");
    expect(openViewing).not.toHaveBeenCalled();

    act(() => { result = state.handlers.requestComparedRentalViewing({ listingId: "b" }); });
    expect(result).toMatchObject({ ok: true });
    expect(openViewing).toHaveBeenCalledWith(current[1]); // no external-source/verification business gate
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reports a stale viewing selection rather than opening a misleading review form", () => {
    const openViewing = vi.fn();
    render(<RentalComparisonPageActions results={current} onOpenDetails={vi.fn()} onScheduleViewing={openViewing} />);
    let result: unknown;
    act(() => { result = state.handlers.requestComparedRentalViewing({ listingId: "removed" }); });
    expect(result).toMatchObject({ ok: false });
    expect(screen.getByRole("status").textContent).toContain("no longer in the current results");
    expect(openViewing).not.toHaveBeenCalled();
  });
});
