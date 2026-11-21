// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  RentalFilterDraftProvider,
  getRentalFilterDraftSnapshot,
  resetRentalFilterDraft,
  useRentalFilterStore,
} from "../rental-filter-draft";

function Control() {
  const { draft, setBeds } = useRentalFilterStore();
  return (
    <select
      aria-label="Bedrooms"
      value={draft.beds ?? ""}
      onChange={(event) => setBeds(event.target.value === "" ? null : event.target.value)}
    >
      <option value="">Any</option>
      <option value="0">Studio</option>
      <option value="1">1 BR</option>
      <option value="2">2 BR</option>
      <option value="3">3 BR+</option>
    </select>
  );
}

beforeEach(() => {
  resetRentalFilterDraft(null);
});

describe("SAN-1655 draft from an applied value", () => {
  it("accepts a new value when the URL already has one", () => {
    render(<RentalFilterDraftProvider initialBeds="1"><Control /></RentalFilterDraftProvider>);
    const select = screen.getByLabelText("Bedrooms") as HTMLSelectElement;
    expect(select.value).toBe("1");
    fireEvent.change(select, { target: { value: "2" } });
    expect(select.value).toBe("2");
    expect(getRentalFilterDraftSnapshot()).toMatchObject({ beds: "2", edited: true });
  });

  it("keeps the edit across a remount that reports the same URL value", () => {
    render(<RentalFilterDraftProvider initialBeds="1"><Control /></RentalFilterDraftProvider>);
    fireEvent.change(screen.getByLabelText("Bedrooms"), { target: { value: "3" } });
    act(() => resetRentalFilterDraft("1"));
    expect(getRentalFilterDraftSnapshot().beds).toBe("3");
  });

  it("lets a genuinely new URL value win", () => {
    render(<RentalFilterDraftProvider initialBeds="1"><Control /></RentalFilterDraftProvider>);
    fireEvent.change(screen.getByLabelText("Bedrooms"), { target: { value: "2" } });
    act(() => resetRentalFilterDraft("3"));
    expect(getRentalFilterDraftSnapshot()).toMatchObject({ beds: "3", edited: false });
  });
});

describe("SAN-1655 connection signal", () => {
  it("is connected only while the page provider is mounted", () => {
    const view = render(<RentalFilterDraftProvider initialBeds="1"><Control /></RentalFilterDraftProvider>);
    expect(getRentalFilterDraftSnapshot().connected).toBe(true);
    view.unmount();
    expect(getRentalFilterDraftSnapshot().connected).toBe(false);
  });
});
