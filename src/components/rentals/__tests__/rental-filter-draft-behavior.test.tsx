// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  RentalFilterDraftProvider,
  getRentalFilterDraftSnapshot,
  resetRentalFilterDraft,
  setRentalFilterDraftBeds,
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
    </select>
  );
}

beforeEach(() => resetRentalFilterDraft(null));

describe("SAN-1655 draft from an applied value", () => {
  it("accepts a new value when the URL already has one", () => {
    render(<RentalFilterDraftProvider initialBeds="1"><Control /></RentalFilterDraftProvider>);
    const select = screen.getByLabelText("Bedrooms") as HTMLSelectElement;
    expect(select.value).toBe("1");
    fireEvent.change(select, { target: { value: "2" } });
    expect(select.value).toBe("2");
  });

  it("keeps the edit in the shared store, independent of any React root", () => {
    resetRentalFilterDraft("1");
    expect(getRentalFilterDraftSnapshot().beds).toBe("1");
    setRentalFilterDraftBeds("3");
    expect(getRentalFilterDraftSnapshot()).toMatchObject({ beds: "3", edited: true });
    // A remount of the page tree reseeds from the same URL without losing it.
    resetRentalFilterDraft("1");
    expect(getRentalFilterDraftSnapshot().beds).toBe("3");
  });

  it("reseeds from a new URL value only while unedited", () => {
    render(<RentalFilterDraftProvider initialBeds="1"><Control /></RentalFilterDraftProvider>);
    const select = screen.getByLabelText("Bedrooms") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "2" } });
    resetRentalFilterDraft("2"); // navigation to the applied value
    expect(select.value).toBe("2");
    resetRentalFilterDraft("3"); // a different URL value after editing must not win
    expect(select.value).toBe("2");
  });
});
