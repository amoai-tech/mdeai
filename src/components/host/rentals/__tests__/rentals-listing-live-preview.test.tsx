// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RentalsListingLivePreview } from "@/components/host/rentals/rentals-listing-live-preview";
import type { BrokerOnboardingFormInput } from "@/lib/rentals/broker-onboarding-validate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initial: BrokerOnboardingFormInput = {
  displayName: "Ana Properties",
  whatsapp: "",
  neighborhoods: ["Laureles"],
  address: "",
  bedrooms: 2,
  bathrooms: 1,
  monthlyRentCop: 0,
  photoUrl: "",
  placeId: "",
  formattedAddress: "",
  latitude: null,
  longitude: null,
};

describe("RentalsListingLivePreview", () => {
  it("labels unsaved and missing data truthfully", () => {
    const html = renderToStaticMarkup(<RentalsListingLivePreview listing={initial} />);
    expect(html).toContain("Not saved yet");
    expect(html).toContain("Add monthly rent");
    expect(html).toContain("Add street address");
    expect(html).toContain("Location not confirmed");
    expect(html).not.toContain("Verified");
  });

  it("updates when form fields change without creating a second listing", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      act(() => {
        root.render(<RentalsListingLivePreview listing={initial} />);
      });
      expect(container.textContent).toContain("Add monthly rent");
      act(() => {
        root.render(
          <RentalsListingLivePreview
            listing={{
              ...initial,
              address: "Calle 44 #71-12, Laureles",
              monthlyRentCop: 2_500_000,
              bedrooms: 3,
              bathrooms: 2,
            }}
          />,
        );
      });
      expect(container.querySelector('[data-testid="ro-live-preview-price"]')?.textContent)
        .toContain("COP 2,500,000");
      expect(container.querySelector('[data-testid="ro-live-preview-location"]')?.textContent)
        .toContain("Calle 44 #71-12");
      expect(container.textContent).toContain("3");
      expect(container.textContent).toContain("Location not confirmed");
    } finally {
      act(() => root.unmount());
    }
  });

  it("distinguishes selected address from server-confirmed coordinates", () => {
    const html = renderToStaticMarkup(
      <RentalsListingLivePreview
        listing={{
          ...initial,
          address: "Calle 44",
          placeId: "ChIJabc",
          formattedAddress: "Calle 44, Medellín",
        }}
      />,
    );
    expect(html).toContain("Coordinates are confirmed by the server when you save");
    expect(html).not.toContain("Location verified");
  });

  it("does not present invalid numeric form values as property facts", () => {
    const html = renderToStaticMarkup(
      <RentalsListingLivePreview
        listing={{ ...initial, bedrooms: Number.NaN, bathrooms: -1, monthlyRentCop: Infinity }}
      />,
    );
    expect(html).toContain("Add monthly rent");
    expect(html).toContain("Not specified");
    expect(html).not.toContain("Infinity");
    expect(html).not.toContain("NaN");
  });

  it("previews a valid user-provided image, not invalid schemes", () => {
    const valid = renderToStaticMarkup(
      <RentalsListingLivePreview listing={{ ...initial, photoUrl: "https://example.com/photo.jpg" }} />,
    );
    expect(valid).toContain('data-testid="ro-live-preview-photo"');
    const invalid = renderToStaticMarkup(
      <RentalsListingLivePreview listing={{ ...initial, photoUrl: "javascript:alert(1)" }} />,
    );
    expect(invalid).not.toContain('data-testid="ro-live-preview-photo"');
  });
});
