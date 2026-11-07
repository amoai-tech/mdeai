// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RentalComparison,
  exactMonthlyRent,
  resolveRentalComparisonRows,
  type ComparisonRentalRow,
} from "../rental-comparison";

const rows: ComparisonRentalRow[] = [
  { id: "laureles-1", title: "Laureles two-bedroom", neighborhood: "Laureles", bedrooms: 2,
    price_monthly: 2_400_000, currency: "COP", amenities: ["Balcony"], can_schedule_viewing: true },
  { id: "poblado-2", title: "Poblado studio", neighborhood: "El Poblado", bedrooms: 0,
    nightly_price: 95, currency: "USD", wifi: false },
  { id: "external_3", title: "External listing", neighborhood: "Belén", bedrooms_unknown: true,
    price_monthly: 1_900_000, amenities: ["Parking"], tags: ["external-source"] },
  { id: "rental-4", title: "Fourth rental", neighborhood: "Envigado" },
];

describe("SAN-1041 deterministic rental comparison", () => {
  it("requires 2-4 distinct ids from the supplied source rows", () => {
    expect(resolveRentalComparisonRows(rows, ["laureles-1"])).toBeNull();
    expect(resolveRentalComparisonRows(rows, ["laureles-1", "laureles-1"])).toBeNull();
    expect(resolveRentalComparisonRows(rows, ["laureles-1", "forged-id"])).toBeNull();
    expect(resolveRentalComparisonRows(rows, ["laureles-1", "poblado-2", "external_3", "rental-4", "forged"])).toBeNull();
    expect(resolveRentalComparisonRows(rows, ["external_3", "laureles-1"])?.map(r => r.id)).toEqual(["external_3", "laureles-1"]);
    expect(resolveRentalComparisonRows(rows.slice(0, 1), ["laureles-1", "poblado-2"])).toBeNull();
  });

  it("uses only an explicitly supplied monthly rent with known currency", () => {
    expect(exactMonthlyRent(rows[0])).toBe("COP 2,400,000/month");
    expect(exactMonthlyRent(rows[1])).toBe("Not specified");
    expect(exactMonthlyRent(rows[2])).toBe("Not specified"); // no known source currency
    expect(exactMonthlyRent(rows[3])).toBe("Not specified");
    expect(exactMonthlyRent({ ...rows[0], price_monthly: -20 })).toBe("Not specified");
  });

  it("displays sourced facts and unknowns, never multiplying nightly rent", () => {
    render(<RentalComparison rows={rows} listingIds={["laureles-1", "poblado-2"]} />);
    expect(screen.getByRole("table", { name: /apartment comparison/i })).not.toBeNull();
    expect(screen.getByText("COP 2,400,000/month")).not.toBeNull();
    expect(screen.getByText("$95/night")).not.toBeNull();
    expect(screen.queryByText(/USD 2,850/)).toBeNull();
    expect(screen.getByText("Balcony")).not.toBeNull();
    expect(screen.getByText("Studio")).not.toBeNull();
    // The search tool can encode an unknown Wi-Fi speed as false, not proven "No".
    expect(screen.queryByText("No")).toBeNull();
    expect(screen.getAllByText("Not specified").length).toBeGreaterThan(0);
  });

  it("shows every listing-provided amenity rather than silently hiding items after four", () => {
    const rich = { ...rows[0], amenities: ["Balcony", "Parking", "Elevator", "Gym", "Pets allowed"] };
    render(<RentalComparison rows={[rich, rows[1]]} listingIds={["laureles-1", "poblado-2"]} />);
    expect(screen.getByText("Balcony, Parking, Elevator, Gym, Pets allowed")).not.toBeNull();
    const wifi = screen.getByRole("row", { name: /Wi-Fi/i });
    expect(wifi.textContent).toContain("Not specified");
    expect(wifi.querySelectorAll("td")[1]?.textContent).toBe("Not specified");
  });

  it("only focuses genuine pins, uses existing Details and viewing callbacks", () => {
    const focus = vi.fn(); const details = vi.fn(); const viewing = vi.fn();
    render(<RentalComparison rows={rows} listingIds={["laureles-1", "poblado-2"]}
      hasPin={id => id === "laureles-1"} onFocusPin={focus} onOpenDetails={details}
      onScheduleViewing={viewing} />);
    const first = screen.getByTestId("rental-comparison-column-laureles-1");
    fireEvent.click(within(first).getByRole("button", { name: /focus on map/i }));
    fireEvent.click(within(first).getByRole("button", { name: /details/i }));
    fireEvent.click(within(first).getByRole("button", { name: /schedule viewing/i }));
    expect(focus).toHaveBeenCalledWith("laureles-1");
    expect(details).toHaveBeenCalledWith(rows[0]);
    expect(viewing).toHaveBeenCalledWith(rows[0]);
    const second = screen.getByTestId("rental-comparison-column-poblado-2");
    expect(within(second).queryByRole("button", { name: /focus on map/i })).toBeNull();
    expect(within(second).queryByRole("button", { name: /schedule viewing/i })).toBeNull();
  });

  it("does not render a comparison for forged or stale results", () => {
    render(<RentalComparison rows={rows.slice(0, 1)} listingIds={["laureles-1", "poblado-2"]}/>);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/not in these results/i);
  });
});
