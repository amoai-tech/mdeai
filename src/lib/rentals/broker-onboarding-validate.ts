export type BrokerOnboardingFormInput = {
  displayName: string;
  whatsapp: string;
  neighborhoods: string[];
  address: string;
  bedrooms: number;
  bathrooms: number;
  monthlyRentCop: number;
  photoUrl: string;
  /** Legacy input only; Phase A cannot require business rights approval. */
  confirmedListingRights?: boolean;
  /** Google Places (New) place id for the selected property; empty when none was picked. */
  placeId: string;
  /** Provider-normalized address from the selected place; empty when none was picked. */
  formattedAddress: string;
  /** Trusted coordinates from the selected place; both null when unknown. */
  latitude: number | null;
  longitude: number | null;
};

export type BrokerOnboardingSubmitResult =
  | { ok: true }
  | { ok: false; message: string };

// skipcq: JS-0067
function trimOrEmpty(value: string): string {
  return value.trim();
}

/** landlord_profiles has single primary_neighborhood — store full multi-select in notes until array column ships. */
// skipcq: JS-0067
export function brokerNeighborhoodProfileFields(neighborhoods: string[]): {
  primary_neighborhood: string;
  notes: string;
} {
  const primary = neighborhoods[0] ?? "Medellin";
  return {
    primary_neighborhood: primary,
    notes: `service_neighborhoods:${neighborhoods.join(",")}`,
  };
}

/**
 * `public.apartments.bedrooms` and `public.apartments.bathrooms` are Postgres
 * `integer` columns, so 1.5 bathrooms can never be stored. The form and the
 * server action share this predicate: that is what keeps a half bathroom from
 * either failing at the database or being silently rounded into a different
 * property fact.
 */
export function roomCountError(label: string, value: number): string | null {
  if (!Number.isFinite(value)) {
    return `${label} must be a whole number.`;
  }
  if (value < 0) {
    return `${label} cannot be negative.`;
  }
  if (!Number.isInteger(value)) {
    return `${label} must be a whole number, not ${value}.`;
  }
  return null;
}

/** Validates onboarding payload before RPC (unit-testable). */
// skipcq: JS-0067 - JS-R1005 field validation branches
// skipcq: JS-R1005
export function validateBrokerOnboardingInput(
  input: BrokerOnboardingFormInput,
): BrokerOnboardingSubmitResult {
  if (!trimOrEmpty(input.displayName)) {
    return { ok: false, message: "Display name is required." };
  }
  if (!input.neighborhoods.length) {
    return { ok: false, message: "Select at least one neighborhood you serve." };
  }
  if (!trimOrEmpty(input.address)) {
    return { ok: false, message: "Street address is required." };
  }
  const bedroomError = roomCountError("Bedrooms", input.bedrooms);
  if (bedroomError) {
    return { ok: false, message: bedroomError };
  }
  const bathroomError = roomCountError("Bathrooms", input.bathrooms);
  if (bathroomError) {
    return { ok: false, message: bathroomError };
  }
  if (!Number.isFinite(input.monthlyRentCop) || input.monthlyRentCop <= 0) {
    return { ok: false, message: "Monthly rent must be greater than zero." };
  }
  const placeId = input.placeId.trim();
  if (placeId) {
    // Hygiene only: Google publishes no guaranteed length or character set, and no
    // regex can prove authenticity. The server re-verifies the ID against Google
    // Places on save (verifyPlaceId); this check only rejects obvious junk.
    if (!/^\S{1,2048}$/.test(placeId)) {
      return { ok: false, message: "The selected address is invalid. Pick it again." };
    }
    if (!input.formattedAddress.trim()) {
      return {
        ok: false,
        message: "The selected address is missing its normalized form. Pick it again.",
      };
    }
  }
  if ((input.latitude != null || input.longitude != null) && !placeId) {
    return {
      ok: false,
      message:
        "Coordinates can only be saved when a Google Places address is selected. Use the address picker to choose a verified location.",
    };
  }
  if ((input.latitude == null) !== (input.longitude == null)) {
    return { ok: false, message: "Location must include both latitude and longitude." };
  }
  if (input.latitude != null && input.longitude != null) {
    if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
      return { ok: false, message: "Latitude must be between -90 and 90." };
    }
    if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
      return { ok: false, message: "Longitude must be between -180 and 180." };
    }
  }
  const photo = trimOrEmpty(input.photoUrl);
  if (photo) {
    try {
      const url = new URL(photo);
      // MDE is served over HTTPS. An `http:` photo is blocked as mixed content by the
      // browser, so it would persist as a listing photo that can never be displayed.
      // Rejecting it here keeps the stored fact equal to the visible fact.
      if (url.protocol !== "https:") {
        return { ok: false, message: "Photo URL must use https." };
      }
    } catch {
      return { ok: false, message: "Photo URL is not valid." };
    }
  }
  return { ok: true };
}
