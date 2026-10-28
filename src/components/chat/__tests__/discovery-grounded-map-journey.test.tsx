// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DiscoveryGroundedResults } from "../discovery-grounded-results";
import { MapContextProvider, useMapContext } from "@/platform/maps/map-context";
import type { GroundedToolRow } from "@/lib/parse-grounded-tool-result";

const first: GroundedToolRow = {
  id: "google-a", title: "Verified venue A", latitude: 6.24, longitude: -75.57,
};
const second: GroundedToolRow = {
  id: "google-b", title: "Verified venue B", latitude: 6.25, longitude: -75.58,
};

function MapTruth() {
  const { pins, selectedPinId, focusPinId } = useMapContext();
  return <output data-testid="map-truth">
    {JSON.stringify({ pins: pins.map((p) => p.id), selectedPinId, focusPinId })}
  </output>;
}

function Journey({ rows }: { rows: GroundedToolRow[] | null }) {
  return <MapContextProvider seedMockPin={false}>
    <DiscoveryGroundedResults rows={rows} />
    <MapTruth />
  </MapContextProvider>;
}

afterEach(cleanup);

describe("SAN-1390 — real grounded card to canonical map context", () => {
  it("selects A then B and clears the stale selection when A/B disappear", async () => {
    const view = render(<Journey rows={[first, second]} />);
    await waitFor(() => expect(screen.getByTestId("map-truth").textContent).toContain('"pins":["grounded-google-a","grounded-google-b"]'));
    const cards = screen.getAllByTestId("discovery-grounded-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]?.getAttribute("data-pin-id")).toBe("grounded-google-a");
    const [cardA, cardB] = cards;
    if (!cardA || !cardB) throw new Error("Both grounded result cards are required");
    fireEvent.click(cardA);
    expect(cards[0]?.getAttribute("data-selected")).toBe("true");
    fireEvent.click(cardB);
    expect(cards[1]?.getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("map-truth").textContent).toContain('"selectedPinId":"grounded-google-b"');
    view.rerender(<Journey rows={[]} />);
    await waitFor(() => expect(screen.getByTestId("map-truth").textContent).toContain('"selectedPinId":null'));
    expect(screen.getByTestId("map-truth").textContent).toContain('"pins":[]');
  });

  it("allows selecting an unmapped real result for Ask without inventing a pin", async () => {
    const selected: Array<string | null> = [];
    render(<MapContextProvider seedMockPin={false}>
      <DiscoveryGroundedResults rows={[{ id: "unmapped-source-id", title: "Grounded source record" }]}
        selectedId={null} onSelectRow={(id) => selected.push(id)} />
      <MapTruth />
    </MapContextProvider>);
    fireEvent.click(screen.getByTestId("grounded-ask-select"));
    expect(selected).toEqual(["unmapped-source-id"]);
    expect(screen.getByTestId("map-truth").textContent).toContain('"pins":[]');
  });

  it("never creates a map pin when the source supplied no coordinates", async () => {
    render(<Journey rows={[{ id: "without-coordinates", title: "Unmapped place" }]} />);
    await waitFor(() => expect(screen.getByTestId("map-truth").textContent).toContain('"pins":[]'));
    expect(screen.getByTestId("discovery-grounded-card").hasAttribute("data-pin-id")).toBe(false);
  });
});
