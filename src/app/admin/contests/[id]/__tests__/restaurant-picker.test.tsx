// @vitest-environment jsdom

/**
 * The picker is the one screen where a wrong count or a silent failure costs an admin real work.
 * These are the states a browser run cannot reach: the "already linked" and "invalid id" results,
 * because the UI never offers an already-linked restaurant.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { linkMock } = vi.hoisted(() => ({ linkMock: vi.fn() }));
// The component imports "../actions" (contests/actions.ts); from __tests__/ that is ../../actions.
vi.mock("../../actions", () => ({ linkRestaurantsAction: linkMock }));

import { RestaurantPicker } from "../restaurant-picker";

const RESTAURANTS = [
  { id: "a1526000-0000-4000-8000-000000000001", name: "Carmen", neighborhood: "El Poblado" },
  { id: "a1526000-0000-4000-8000-000000000002", name: "Cucayito", neighborhood: "Laureles" },
  { id: "a1526000-0000-4000-8000-000000000003", name: "La Pampa", neighborhood: "Laureles" },
];

function renderPicker() {
  return render(<RestaurantPicker available={RESTAURANTS} contestId="contest-1" />);
}

describe("RestaurantPicker", () => {
  beforeEach(() => linkMock.mockReset());

  it("cannot submit an empty selection", () => {
    renderPicker();
    expect((screen.getByTestId("contest-link-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("contest-picker-count").textContent ?? "").toContain("0 selected");
  });

  it("filters by name and by neighborhood", async () => {
    const user = userEvent.setup();
    renderPicker();
    const search = screen.getByTestId("contest-picker-search");

    await user.type(search, "car");
    expect(screen.getAllByTestId("contest-picker-option")).toHaveLength(1);

    await user.clear(search);
    await user.type(search, "laureles");
    expect(screen.getAllByTestId("contest-picker-option")).toHaveLength(2);
  });

  it("keeps the selection when the search changes", async () => {
    const user = userEvent.setup();
    renderPicker();
    const search = screen.getByTestId("contest-picker-search");

    await user.click(screen.getAllByTestId("contest-picker-option")[0]);
    expect(screen.getByTestId("contest-picker-count").textContent ?? "").toContain("1 selected");

    await user.type(search, "laureles");
    expect(screen.getByTestId("contest-picker-count").textContent ?? "").toContain("1 selected");
  });

  it("selects only the visible restaurants while filtered", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(screen.getByTestId("contest-picker-search"), "laureles");
    await user.click(screen.getByTestId("contest-picker-select-visible"));
    expect(screen.getByTestId("contest-picker-count").textContent ?? "").toContain("2 selected");

    await user.click(screen.getByTestId("contest-picker-clear"));
    expect(screen.getByTestId("contest-picker-count").textContent ?? "").toContain("0 selected");
  });

  it("hides the second scope button until a filter hides something", async () => {
    const user = userEvent.setup();
    renderPicker();

    // Everything is visible, so "Select all" would duplicate "Select visible".
    expect(screen.queryByTestId("contest-picker-select-all")).toBeNull();

    await user.type(screen.getByTestId("contest-picker-search"), "car");
    expect(screen.getByTestId("contest-picker-select-all")).not.toBeNull();
  });

  it("reports a partial success in amber and names the failure", async () => {
    const user = userEvent.setup();
    linkMock.mockResolvedValue({
      status: "partial",
      added: 1,
      already: 0,
      failed: [{ id: RESTAURANTS[1].id, reason: "entry not linked" }],
      rejected: 1,
    });
    renderPicker();

    await user.click(screen.getAllByTestId("contest-picker-option")[0]);
    await user.click(screen.getByTestId("contest-link-submit"));

    const summary = await screen.findByTestId("contest-link-result-summary");
    expect(summary.textContent ?? "").toContain("1 added");
    expect(summary.textContent ?? "").toContain("1 failed");
    // A skipped id must never read as a clean success.
    expect(summary.textContent ?? "").toContain("1 invalid id skipped");

    const failures = screen.getByTestId("contest-link-failures");
    expect(within(failures).getByText(/Cucayito/).textContent ?? "").toContain("entry not linked");

    const banner = screen.getByTestId("contest-link-result");
    expect(banner.className).toContain("amber");
  });

  it("says already linked after an idempotent retry", async () => {
    const user = userEvent.setup();
    linkMock.mockResolvedValue({ status: "success", added: 0, already: 2, failed: [], rejected: 0 });
    renderPicker();

    await user.click(screen.getAllByTestId("contest-picker-option")[0]);
    await user.click(screen.getByTestId("contest-link-submit"));

    const summary = await screen.findByTestId("contest-link-result-summary");
    expect(summary.textContent ?? "").toContain("0 added");
    expect(summary.textContent ?? "").toContain("2 already linked");
    expect(screen.queryByTestId("contest-link-failures")).toBeNull();
  });

  it("keeps only failed restaurants selected for an immediate retry", async () => {
    const user = userEvent.setup();
    linkMock
      .mockResolvedValueOnce({
        status: "partial",
        added: 1,
        already: 0,
        failed: [{ id: RESTAURANTS[1].id, reason: "Temporarily unavailable" }],
        rejected: 0,
      })
      .mockResolvedValueOnce({ status: "success", added: 1, already: 0, failed: [], rejected: 0 });

    renderPicker();
    const options = screen.getAllByTestId("contest-picker-option");
    await user.click(options[0]);
    await user.click(options[1]);
    await user.click(screen.getByTestId("contest-link-submit"));

    await screen.findByTestId("contest-link-result-summary");
    // Successful rows must leave the retry payload, while the failed one stays ticked.
    expect(screen.getByTestId("contest-picker-count").textContent).toContain("1 selected");
    expect((options[0] as HTMLInputElement).checked).toBe(false);
    expect((options[1] as HTMLInputElement).checked).toBe(true);

    await user.click(screen.getByTestId("contest-link-submit"));
    await screen.findByText(/1 added/);
    expect(linkMock).toHaveBeenCalledTimes(2);
    const retryPayload = linkMock.mock.calls[1][1] as FormData;
    expect(retryPayload.getAll("restaurant_ids")).toEqual([RESTAURANTS[1].id]);
    expect(screen.getByTestId("contest-picker-count").textContent).toContain("0 selected");
  });

  it("keeps selection when the server rejects the entire action", async () => {
    const user = userEvent.setup();
    linkMock.mockResolvedValue({
      status: "error",
      added: 0, already: 0, failed: [], rejected: 0,
      message: "Unable to reach contest service",
    });
    renderPicker();
    await user.click(screen.getAllByTestId("contest-picker-option")[0]);
    await user.click(screen.getByTestId("contest-link-submit"));
    await screen.findByText("Unable to reach contest service");
    expect(screen.getByTestId("contest-picker-count").textContent).toContain("1 selected");
  });

  it("submits exactly the selected ids and the contest", async () => {
    const user = userEvent.setup();
    linkMock.mockResolvedValue({ status: "success", added: 1, already: 0, failed: [], rejected: 0 });
    renderPicker();

    await user.click(screen.getAllByTestId("contest-picker-option")[0]);
    await user.click(screen.getByTestId("contest-link-submit"));
    await screen.findByTestId("contest-link-result-summary");

    expect(linkMock).toHaveBeenCalledTimes(1);
    const formData = linkMock.mock.calls[0][1] as FormData;
    expect(formData.get("contest_id")).toBe("contest-1");
    expect(formData.getAll("restaurant_ids")).toEqual([RESTAURANTS[0].id]);
  });
});