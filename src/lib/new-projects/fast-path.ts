/**
 * SAN-1380 — deterministic classifier and parameter builder for the New Projects chat fast path.
 * It only decides "is this a new-projects request?" and extracts the same hard filters the tool
 * accepts. It never invents a filter the buyer did not express.
 */
const NEW_PROJECT_RE =
  /(\bnew\b[\s\w]{0,30}\bprojects?\b)|(\bnew\s+(?:construction|development)s?\b)|(\bnew\s+condos?\b)|(\bnew\s+apartments?\b)|(?:proyectos?\s+nuev\w*)|(?:preventa|pre-venta)|(?:apartamentos?\s+nuev\w*)|(?:obra\s+nueva)|(?:condo\s+projects?)/i;

/** Strong rental wording: "new apartments" is new construction, but "new apartments for rent" is not. */
export const RENTAL_WORD_RE = /\b(for rent|per night|nightly|arriendo|alquiler|airbnb|renta\b)/i;

/** Delivery wording that must sit next to a year before we treat it as a delivery filter. */
const DELIVERY_WORD = /deliver|entrega|entregar|completion|handover/i;

const NEIGHBORHOODS = ["Laureles", "Ciudad del Río", "El Poblado"] as const;

export function looksLikeNewProjectQuery(text: string): boolean {
  return NEW_PROJECT_RE.test(text);
}

export function buildNewProjectFastPathParams(text: string): Record<string, unknown> {
  const params: Record<string, unknown> = { limit: 5 };
  const lower = text.toLowerCase();

  const neighborhood = NEIGHBORHOODS.find((n) => lower.includes(n.toLowerCase()));
  if (neighborhood) params.neighborhood = neighborhood;

  const beds = text.match(/(\d)\s*(\+)?\s*(?:bed(?:room)?s?|habitaci[oó]n(?:es)?|alcoba(?:s)?|br)\b/i);
  if (beds) {
    // Qualify only next to the matched bedroom phrase — an unrelated "3+ cars" must not turn an
    // exact "2 bedrooms" into "2+".
    const at = beds.index ?? 0;
    const local = text.slice(Math.max(0, at - 14), at + beds[0].length + 14).toLowerCase();
    const qualified = beds[2] === "+" || /at least|or more|m[aá]s de|minimum/.test(local);
    if (qualified) params.minBedrooms = Number(beds[1]);
    else params.bedroomsExact = Number(beds[1]);
  }

  const price = text.match(/(?:under|below|bajo|menos de)\s*\$?\s*([\d.,]+)\s*(million|millones|m)\b/i);
  if (price) {
    const millions = Number(price[1].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
    if (Number.isFinite(millions) && millions > 0) {
      params.maxPriceCop = Math.round(millions * 1_000_000);
    }
  }

  // A bare year ("announced in 2025") is not a delivery filter; require delivery wording nearby.
  for (const year of text.matchAll(/\b(20[2-9]\d)\b/g)) {
    const at = year.index ?? 0;
    const window = text.slice(Math.max(0, at - 24), at + year[1].length + 24);
    if (DELIVERY_WORD.test(window)) {
      params.deliveryYear = Number(year[1]);
      break;
    }
  }

  return params;
}
