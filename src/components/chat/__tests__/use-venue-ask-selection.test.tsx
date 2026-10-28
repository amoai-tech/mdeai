// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DiscoveryGroundedResults } from "../discovery-grounded-results";
import { useVenueAskSelection } from "../use-venue-ask-selection";
import { MapContextProvider, useMapContext } from "@/platform/maps/map-context";
import type { GroundedToolRow } from "@/lib/parse-grounded-tool-result";

const a: GroundedToolRow = { id: "grounded-a", title: "Verified Café A", latitude: 6.24, longitude: -75.57 };
const b: GroundedToolRow = { id: "grounded-b", title: "Verified Café B", latitude: 6.25, longitude: -75.58 };
const unmapped: GroundedToolRow = { id: "grounded-without-coordinates", title: "Place missing coordinates" };

function SelectionHarness({ rows }: { rows: GroundedToolRow[] }) {
  const { selectedId, selectForAsk } = useVenueAskSelection(rows, []);
  const { setSelectedPinId, selectedPinId, pins } = useMapContext();
  return <>
    <output data-testid="selected-ask-id">{selectedId ?? "NONE"}</output>
    <output data-testid="map-id">{selectedPinId ?? "NONE"}</output>
    <output data-testid="pin-count">{pins.length}</output>
    <button onClick={() => setSelectedPinId("grounded-grounded-b")}>Click map pin B</button>
    <button onClick={() => setSelectedPinId(null)}>Clear map pin</button>
    <DiscoveryGroundedResults rows={rows} selectedId={selectedId} onSelectRow={selectForAsk} />
  </>;
}

function Fixture({ rows }: { rows: GroundedToolRow[] }) {
  return <MapContextProvider seedMockPin={false}><SelectionHarness rows={rows} /></MapContextProvider>;
}

afterEach(cleanup);

describe("SAN-737 venue Ask selection follows map truth", () => {
  it("switches card Ask A to mapped B and never resurrects A after clearing B", async () => {
    render(<Fixture rows={[a, b]} />);
    await waitFor(() => expect(screen.getByTestId("pin-count").textContent).toBe("2"));
    const buttons = screen.getAllByTestId("grounded-ask-select");
    fireEvent.click(buttons[0]!);
    expect(screen.getByTestId("selected-ask-id").textContent).toBe("grounded-a");
    fireEvent.click(screen.getByText("Click map pin B"));
    await waitFor(() => expect(screen.getByTestId("selected-ask-id").textContent).toBe("grounded-b"));
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByText("Clear map pin"));
    await waitFor(() => expect(screen.getByTestId("selected-ask-id").textContent).toBe("NONE"));
  });

  it("keeps coordinate-less places selectable for Ask without creating fake pins", async () => {
    render(<Fixture rows={[unmapped]} />);
    expect(screen.getByTestId("pin-count").textContent).toBe("0");
    fireEvent.click(screen.getByTestId("grounded-ask-select"));
    expect(screen.getByTestId("selected-ask-id").textContent).toBe(unmapped.id);
    expect(screen.getByTestId("map-id").textContent).toBe("NONE");
    fireEvent.click(screen.getByTestId("grounded-ask-select"));
    expect(screen.getByTestId("selected-ask-id").textContent).toBe("NONE");
  });

  it("clears a previously unmapped Ask item after map B is selected and deselected", async () => {
    render(<Fixture rows={[unmapped, b]} />);
    await waitFor(() => expect(screen.getByTestId("pin-count").textContent).toBe("1"));
    fireEvent.click(screen.getAllByTestId("grounded-ask-select")[0]!);
    expect(screen.getByTestId("selected-ask-id").textContent).toBe(unmapped.id);
    fireEvent.click(screen.getByText("Click map pin B"));
    await waitFor(() => expect(screen.getByTestId("selected-ask-id").textContent).toBe("grounded-b"));
    fireEvent.click(screen.getByText("Clear map pin"));
    await waitFor(() => expect(screen.getByTestId("selected-ask-id").textContent).toBe("NONE"));
  });
});
