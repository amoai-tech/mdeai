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

describe("external source rental cards", () => {
  it("shows a real monthly COP price, unknown bedrooms, and the original-advertisement link", () => {
    const html = renderToStaticMarkup(
      <RentalCard
        id="candidate-fincaraiz-193916988"
        listingId="candidate-fincaraiz-193916988"
        title="Conquistadores"
        neighborhood="Conquistadores"
        nightly_price={0}
        price_monthly={2100000}
        currency="COP"
        bedrooms={0}
        bedrooms_unknown
        tags={["external-source", "not-verified"]}
        source_url="https://www.fincaraiz.com.co/apartaestudio-en-arriendo-en-conquistadores-medellin/193916988"
        canScheduleViewing={false}
        onSchedule={() => undefined}
      />
    );
    expect(html).toContain("COP 2,100,000/mo");
    expect(html).toContain("Bedrooms unknown");
    expect(html).toContain("View original listing");
    expect(html).not.toContain("COP 0/night");
    expect(html).not.toContain("0 BR");
    expect(html).not.toContain("Schedule viewing");
  });
});

// SAN-1503 — WE Home rents for COP 14,500,000 a month. Its "nightly" figure is only rent ÷ 30, so the
// chat card must lead with the monthly rent and not offer "COP 483,333/night".
describe("SAN-1503 rental card shows the stored monthly rent, not a derived nightly price", () => {
  const base = { id: "r1", listingId: "a1", title: "WE Home", neighborhood: "El Poblado", bedrooms: 2, onSelect: () => undefined };

  it("hides the derived nightly label when a monthly rent is stored", () => {
    const html = renderToStaticMarkup(
      <RentalCard {...base} nightly_price={483333} price_monthly={14500000} currency="COP" />,
    );
    expect(html).toContain("COP 14,500,000/mo");
    expect(html).not.toContain("/night");
  });

  it("still shows the nightly price when the listing has no monthly rent", () => {
    const html = renderToStaticMarkup(<RentalCard {...base} nightly_price={75} />);
    expect(html).toContain("$75/night");
  });
});

describe("SAN-1505 mobile rental photo presentation", () => {
  const card = {
    id: "external-1",
    listingId: "external-1",
    title: "Laureles apartment",
    neighborhood: "Laureles",
    nightly_price: 0,
    price_monthly: 3_000_000,
    currency: "COP",
    bedrooms: 2,
    tags: ["external-source", "not-verified"],
    canScheduleViewing: false,
  } as const;

  it("displays authorized media on phone width without unlocking Schedule viewing", () => {
    const html = renderToStaticMarkup(
      <RentalCard
        {...card}
        tags={[...card.tags]}
        photoUrl="https://example.com/approved-apartment.webp"
        onSchedule={() => undefined}
      />,
    );
    expect(html).toContain('alt="Laureles apartment rental photo in Laureles"');
    expect(html).toContain("approved-apartment.webp");
    expect(html).toMatch(/aspect-\[16\/10\]/);
    expect(html).not.toMatch(/class="hidden[^"]*"[^>]*>\s*<img/);
    expect(html).not.toContain('data-testid="rental-schedule-cta"');
  });

  it("keeps no-photo mobile cards text-only while retaining the desktop fallback", () => {
    const html = renderToStaticMarkup(<RentalCard {...card} tags={[...card.tags]} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("sm:flex");
    expect(html).toContain("Photo");
    expect(html).not.toContain('data-testid="rental-schedule-cta"');
  });
});
