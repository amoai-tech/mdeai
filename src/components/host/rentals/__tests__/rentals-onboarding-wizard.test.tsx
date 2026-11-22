// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rentals/submit-broker-onboarding", () => ({
  submitBrokerOnboarding: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/components/host/rentals/broker-address-search", () => ({
  BrokerAddressSearch: ({
    value,
    onTextChange,
    onSelect,
  }: {
    value: string;
    onTextChange: (value: string) => void;
    onSelect: (result: {
      placeId: string;
      displayName: string | null;
      formattedAddress: string | null;
      latitude: number | null;
      longitude: number | null;
    }) => void;
  }) => (
    <div>
      <input
        aria-label="Street address"
        value={value}
        onChange={(event) => onTextChange(event.target.value)}
      />
      <button
        type="button"
        onClick={() =>
          onSelect({
            placeId: "ChIJwithoutAddress",
            displayName: "Result without a normalized address",
            formattedAddress: null,
            latitude: null,
            longitude: null,
          })
        }
      >
        Select place without address
      </button>
    </div>
  ),
}));

import { RentalsOnboardingWizard } from "@/components/host/rentals/rentals-onboarding-wizard";

function reachListingStep() {
  render(<RentalsOnboardingWizard />);
  fireEvent.change(screen.getByLabelText("Display / company name"), {
    target: { value: "Ana Properties" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Laureles" }));
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
}

function fillListingStep({ bathrooms = "1", bedrooms = "2", rent = "2400000" } = {}) {
  fireEvent.change(screen.getByLabelText("Street address"), {
    target: { value: "Calle 44 #71-12" },
  });
  fireEvent.change(screen.getByLabelText("Bedrooms"), { target: { value: bedrooms } });
  fireEvent.change(screen.getByLabelText("Bathrooms"), { target: { value: bathrooms } });
  fireEvent.change(screen.getByLabelText("Monthly rent (COP)"), { target: { value: rent } });
}

describe("RentalsOnboardingWizard numeric contract", () => {
  it("blocks a half bathroom with the shared integer message instead of rounding it", () => {
    reachListingStep();
    fillListingStep({ bathrooms: "1.5" });

    expect(screen.getByLabelText("Bathrooms").getAttribute("step")).toBe("1");
    expect(screen.getByTestId("ro-bathrooms-error").textContent).toContain(
      "Bathrooms must be a whole number, not 1.5.",
    );
    expect((screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("treats a cleared bedroom field as missing, not as zero", () => {
    reachListingStep();
    fillListingStep({ bedrooms: "" });

    expect(screen.getByTestId("ro-bedrooms-error").textContent).toContain(
      "Bedrooms must be a whole number.",
    );
    expect((screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("accepts whole numbers and previews them live", () => {
    reachListingStep();
    fillListingStep({ bathrooms: "2", rent: "2500000" });

    expect(screen.queryByTestId("ro-bathrooms-error")).toBeNull();
    expect(screen.getByTestId("ro-live-preview-price").textContent).toContain("COP 2,500,000");
    expect(screen.getByTestId("ro-live-preview-bathrooms").textContent).toBe("2");

    const continueButton = screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(false);
    fireEvent.click(continueButton);

    expect(screen.getByTestId("ro-step-review")).toBeTruthy();
    // The preview follows the broker to Review, exactly once.
    expect(screen.getAllByTestId("ro-live-preview")).toHaveLength(1);
    expect(screen.getByTestId("ro-live-preview-bathrooms").textContent).toBe("2");
  });

  it("keeps the draft saveable when a provider result has no normalized address", () => {
    reachListingStep();
    fillListingStep();
    fireEvent.click(screen.getByRole("button", { name: "Select place without address" }));

    // The unconfirmed location must not masquerade as a selected place, and the
    // submit validator must not reject a place id it can never verify.
    expect(screen.queryByTestId("ro-address-verified")).toBeNull();
    expect(screen.getByTestId("ro-live-preview-place-status").textContent).toContain(
      "Location not confirmed",
    );

    const continueButton = screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(false);
    fireEvent.click(continueButton);
    expect(screen.getByTestId("ro-step-review")).toBeTruthy();
  });
});
