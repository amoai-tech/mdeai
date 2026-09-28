import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { RentalCard } from "../rental-card";

const RENTAL_CARD_PATH = resolve(__dirname, "../rental-card.tsx");

describe("UX-027 rental card copy leaks (UX-T-027 / CU-P0-07)", () => {
  it("source has no internal SCREEN ticket IDs or dev photo placeholder", () => {
    const src = readFileSync(RENTAL_CARD_PATH, "utf8");
    expect(src).not.toMatch(/SCREEN-\d+/);
    expect(src).not.toMatch(/Photo soon/i);
  });

  it("rendered Save CTA uses user-facing tooltip, not internal ticket copy", () => {
    const html = renderToStaticMarkup(
      <RentalCard
        id="rental-1"
        listingId="apt-1"
        title="1BR Laureles"
        neighborhood="Laureles"
        nightly_price={75}
        bedrooms={1}
        onSelect={() => undefined}
      />,
    );
    expect(html).toContain('title="Save for later (coming soon)"');
    expect(html).not.toMatch(/SCREEN-/);
    expect(html).not.toMatch(/Photo soon/i);
  });

  it("UX-021 exposes data-result-kind and aria-label on interactive card", () => {
    const html = renderToStaticMarkup(
      <RentalCard
        id="rental-1"
        listingId="apt-1"
        title="1BR Laureles"
        neighborhood="Laureles"
        nightly_price={75}
        bedrooms={1}
        onSelect={() => undefined}
      />,
    );
    expect(html).toContain('data-result-kind="rental"');
    expect(html).toContain('aria-label="Rental: 1BR Laureles, Laureles"');
    expect(html).toContain('data-result-kind="rental"');
  });
});

// SAN-1349 — the chat rental card is a second CTA surface beside the browse card, and it must
// honour the same server-proven requestability flag. This gap was found by the deterministic
// Chromium journey in CI: the unowned mock still rendered a Schedule viewing button.
describe("SAN-1349 rental card viewing CTA gating", () => {
  const base = {
    id: "rental-1",
    listingId: "apt-1",
    title: "1BR Laureles",
    neighborhood: "Laureles",
    nightly_price: 75,
    bedrooms: 1,
  } as const;

  it("renders the CTA when requestability is proven and a handler exists", () => {
    const html = renderToStaticMarkup(
      <RentalCard {...base} canScheduleViewing onSchedule={() => undefined} />,
    );
    expect(html).toContain('data-testid="rental-schedule-cta"');
    expect(html).toContain("Schedule viewing");
  });

  it("withholds the CTA when the listing is not requestable", () => {
    const html = renderToStaticMarkup(
      <RentalCard {...base} canScheduleViewing={false} onSchedule={() => undefined} />,
    );
    expect(html).not.toContain('data-testid="rental-schedule-cta"');
    expect(html).not.toContain("Schedule viewing");
  });

  it("withholds the CTA when requestability was never proven (flag omitted)", () => {
    const html = renderToStaticMarkup(<RentalCard {...base} onSchedule={() => undefined} />);
    expect(html).not.toContain('data-testid="rental-schedule-cta"');
  });

  it("withholds the CTA when there is no handler even though the flag is true", () => {
    const html = renderToStaticMarkup(<RentalCard {...base} canScheduleViewing />);
    expect(html).not.toContain('data-testid="rental-schedule-cta"');
  });

  it("still renders the rental card itself when the CTA is withheld", () => {
    const html = renderToStaticMarkup(
      <RentalCard {...base} canScheduleViewing={false} onSchedule={() => undefined} />,
    );
    expect(html).toContain('data-testid="rental-card"');
    expect(html).toContain("1BR Laureles");
  });
});
