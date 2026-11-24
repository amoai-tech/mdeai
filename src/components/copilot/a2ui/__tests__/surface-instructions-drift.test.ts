import { describe, expect, it } from "vitest";
import {
  RENTAL_RECOMMENDATIONS_COMPONENTS,
  RENTAL_RECOMMENDATIONS_DESCRIPTION,
} from "@/components/copilot/a2ui/rental-recommendations-surface";
import {
  EVENT_RECOMMENDATIONS_COMPONENTS,
  EVENT_RECOMMENDATIONS_DESCRIPTION,
} from "@/components/copilot/a2ui/event-recommendations-surface";
import { MDE_A2UI_GUIDE, MDE_GENERATIVE_UI_RULES } from "@/mastra/lib/generative-ui-context";
import { MDE_OMITTED_STANDARD_COMPONENTS, mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";

/**
 * F1/F6 of the Generative UI forensic audit: a Surface description, its component
 * allowlist and the Mastra guide are three statements the model reads together.
 * They must not contradict each other.
 */
describe("Surface instructions agree with their allowlists and the Mastra guide", () => {
  const controls = RENTAL_RECOMMENDATIONS_COMPONENTS.filter(
    (name) => name === "BedroomFilter" || name === "ApplyFiltersButton" || name === "ViewingProposal",
  );

  it("rentals: never says 'no controls' while the allowlist carries controls", () => {
    expect(controls).toHaveLength(3);
    expect(RENTAL_RECOMMENDATIONS_DESCRIPTION).not.toMatch(/no controls/i);
  });

  it("rentals: names exactly the allowed controls and limits them to an explicit bedroom request", () => {
    for (const name of controls) expect(RENTAL_RECOMMENDATIONS_DESCRIPTION).toContain(name);
    expect(RENTAL_RECOMMENDATIONS_DESCRIPTION).toMatch(/only when the renter explicitly asks to change bedrooms/i);
    expect(RENTAL_RECOMMENDATIONS_DESCRIPTION).toMatch(/only when the renter explicitly asks to schedule a viewing/i);
  });

  it("viewing proposal: the guide teaches it in both agent paths and never lets the model claim a booking", () => {
    for (const text of [MDE_A2UI_GUIDE, MDE_GENERATIVE_UI_RULES]) {
      expect(text).toContain("ViewingProposal");
      expect(text).toMatch(/never guess a calendar date/i);
      expect(text).toMatch(/Never say a viewing is booked, requested or confirmed/i);
    }
  });

  it("rentals: the guide and the server rules allow the same two controls on the same panel", () => {
    for (const text of [MDE_A2UI_GUIDE, MDE_GENERATIVE_UI_RULES]) {
      expect(text).toContain("BedroomFilter plus ApplyFiltersButton in the rental-recommendations panel");
    }
  });

  it("rentals: the description keeps grounded cards and never invites invented facts", () => {
    expect(RENTAL_RECOMMENDATIONS_COMPONENTS).toContain("RentalCard");
    expect(RENTAL_RECOMMENDATIONS_DESCRIPTION).toMatch(/Never state or invent a price/i);
  });

  it("events: the description works on /events and in chat, and allows no controls", () => {
    expect(EVENT_RECOMMENDATIONS_DESCRIPTION).not.toMatch(/concierge chat/i);
    expect([...EVENT_RECOMMENDATIONS_COMPONENTS]).toEqual(["EventCard", "Column", "Title"]);
  });

  it("SAN-1675: the guide names every exposed component and never advertises an omitted one as available", () => {
    const named = (text: string, name: string) => text.split(/\W+/).includes(name);
    for (const name of mdeUI.components.keys()) {
      expect(named(MDE_A2UI_GUIDE, name), `${name} missing from the fallback guide`).toBe(true);
    }
    for (const text of [MDE_A2UI_GUIDE, MDE_GENERATIVE_UI_RULES]) {
      const available = text.slice(text.indexOf("Official components also available"), text.indexOf(" are not available"));
      const notAvailable = available.slice(available.lastIndexOf(".") + 1);
      for (const name of MDE_OMITTED_STANDARD_COMPONENTS) {
        expect(named(available.slice(0, available.lastIndexOf(".")), name), `${name} advertised as available`).toBe(false);
      }
      expect(notAvailable).toMatch(/\bMap\b/);
      // The trust limits the schema enforces are stated in both agent paths.
      expect(text).toMatch(/never claim a save, booking or payment/);
      expect(text).toContain("TableSection, TableRow and TableCell are reserved for app-authored deterministic dashboards, not model-authored tables");
      expect(text).not.toContain("TableSection, TableRow and TableCell for data");
      expect(text).toMatch(/only stored MDE photo URLs/);
      expect(text).toMatch(/never estimate, round or invent a number/);
    }
  });
});
