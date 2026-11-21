// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { fireEvent, render, screen } from "@testing-library/react";
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
      expect(container.querySelector('[data-testid="ro-live-preview-bedrooms"]')?.textContent)
        .toBe("3");
      expect(container.querySelector('[data-testid="ro-live-preview-bathrooms"]')?.textContent)
        .toBe("2");
      expect(container.textContent).toContain("Location not confirmed");
    } finally {
      act(() => root.unmount());
    }
  });

  it("distinguishes a selected address from server-confirmed location", () => {
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
    expect(html).toContain("The server re-checks it with Google when you save");
    expect(html).not.toContain("Location verified");
    // No coordinate claim: verifyPlaceId may legitimately return no coordinates.
    expect(html).not.toContain("Coordinates are confirmed");
  });

  it("does not present invalid numeric form values as property facts", () => {
    const { container } = render(
      <RentalsListingLivePreview
        listing={{ ...initial, bedrooms: Number.NaN, bathrooms: -1, monthlyRentCop: Infinity }}
      />,
    );
    expect(screen.getByTestId("ro-live-preview-price").textContent).toContain("Add monthly rent");
    expect(screen.getByTestId("ro-live-preview-bedrooms").textContent).toBe("Not specified");
    expect(screen.getByTestId("ro-live-preview-bathrooms").textContent).toBe("Not specified");
    const text = container.textContent ?? "";
    expect(text).not.toContain("-1");
    expect(text).not.toContain("Infinity");
    expect(text).not.toContain("NaN");
  });

  it("previews the exact https URL the broker supplied", () => {
    const url = "https://example.com/photos/apt-1.jpg";
    const { container } = render(
      <RentalsListingLivePreview listing={{ ...initial, photoUrl: url }} />,
    );
    const photo = container.querySelector('[data-testid="ro-live-preview-photo"]');
    expect(photo?.getAttribute("src")).toBe(url);
  });

  it("rejects non-https and unparsable photo links instead of rendering them", () => {
    for (const photoUrl of ["javascript:alert(1)", "http://example.com/a.jpg", "not a url"]) {
      const { container, unmount } = render(
        <RentalsListingLivePreview listing={{ ...initial, photoUrl }} />,
      );
      expect(container.querySelector('[data-testid="ro-live-preview-photo"]')).toBeNull();
      expect(screen.getByTestId("ro-live-preview-photo-status").textContent).toContain(
        "Use a direct https link",
      );
      unmount();
    }
  });

  it("shows a loading state until the image decodes", () => {
    const { container } = render(
      <RentalsListingLivePreview listing={{ ...initial, photoUrl: "https://example.com/a.jpg" }} />,
    );
    expect(container.querySelector('[data-testid="ro-live-preview-photo-loading"]')).not.toBeNull();
    const photo = container.querySelector('[data-testid="ro-live-preview-photo"]');
    if (!photo) throw new Error("expected the supplied photo to render");
    fireEvent.load(photo);
    expect(container.querySelector('[data-testid="ro-live-preview-photo-loading"]')).toBeNull();
  });

  it("recovers from a broken photo: placeholder, retry, then a new attempt", () => {
    const url = "https://example.com/broken.jpg";
    const { container, rerender } = render(
      <RentalsListingLivePreview listing={{ ...initial, photoUrl: url }} />,
    );
    const photo = container.querySelector('[data-testid="ro-live-preview-photo"]');
    if (!photo) throw new Error("expected the supplied photo to render");
    fireEvent.error(photo);
    expect(container.querySelector('[data-testid="ro-live-preview-photo"]')).toBeNull();
    expect(container.querySelector('[data-testid="ro-live-preview-photo-status"]')?.textContent)
      .toContain("Photo unavailable");

    fireEvent.click(screen.getByTestId("ro-live-preview-photo-retry"));
    expect(container.querySelector('[data-testid="ro-live-preview-photo"]')).not.toBeNull();

    // A different URL must never inherit the failed state of the previous one.
    fireEvent.error(container.querySelector('[data-testid="ro-live-preview-photo"]')!);
    rerender(
      <RentalsListingLivePreview listing={{ ...initial, photoUrl: "https://example.com/ok.jpg" }} />,
    );
    const recovered = container.querySelector('[data-testid="ro-live-preview-photo"]');
    expect(recovered?.getAttribute("src")).toBe("https://example.com/ok.jpg");
  });

  it("never claims the photo is verified or uploaded", () => {
    const html = renderToStaticMarkup(
      <RentalsListingLivePreview
        listing={{ ...initial, photoUrl: "https://example.com/a.jpg" }}
      />,
    );
    expect(html).not.toMatch(/verified|uploaded|approved/i);
  });
});
