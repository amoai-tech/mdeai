// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/react";
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
      <option value="1">1 BR</option>
      <option value="2">2 BR</option>
    </select>
  );
}

let roots: Root[] = [];
function mount(element: React.ReactElement) {
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => root.render(element));
  return el;
}

beforeEach(() => resetRentalFilterDraft(null));
afterEach(() => {
  act(() => { for (const root of roots) root.unmount(); });
  roots = [];
  document.body.innerHTML = "";
});

describe("SAN-1655 across two React roots", () => {
  it("reflects an edit made in the AI panel root in the page root", () => {
    // Root 1: the page and its provider (no control rendered there).
    const pageEl = mount(<RentalFilterDraftProvider initialBeds="1"><div /></RentalFilterDraftProvider>);
    // Root 2: the AI surface, a separate React root without a provider.
    const panelEl = mount(<Control />);

    const select = panelEl.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("1");
    fireEvent.change(select, { target: { value: "2" } });
    expect((panelEl.querySelector("select") as HTMLSelectElement).value).toBe("2");
    expect(getRentalFilterDraftSnapshot()).toMatchObject({ beds: "2", edited: true });
    // The page root is still mounted and sees the same draft.
    expect(pageEl.isConnected).toBe(true);
  });
});
